import { createLogger } from '../../common/logging/logger.js';
import { artistNamesMatch } from './artistNameMatch.js';
import { fetchDaprProvider, isAbortError } from './httpClient.js';
import { getRateLimiter } from './rateLimiter.js';
import { isConfirmedMissingFetchFailure, isFetchFailureResult } from './types.js';
import type { ArtistImageLookupOptions, HttpOptions, ProviderValueState } from './types.js';

const logger = createLogger('services.musicApi.deezer');

const DEEZER_ARTIST_PATH = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?artist\/(\d+)/i;
const DEEZER_ALBUM_PATH = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?album\/(\d+)/i;

/**
 * Deezer cover paths for a release/album.
 *
 * DevTools on deezer.com confirmed two forms for an album without artwork:
 *   /images/cover/d41d8cd98f00b204e9800998ecf8427e/264x264-000000-80-0-0.jpg
 *   /images/cover//500x500.jpg
 * The empty hash (MD5 of "") is the same asset the artist placeholder uses, but
 * under a different path, so the check is path-scoped rather than hash-only.
 */
const DEEZER_CDN_COVER_PATH = /\/images\/cover\/([^/]*)\//i;
const DEEZER_EMPTY_COVER_PATH = /\/images\/cover\/\//i;

export const isDeezerPlaceholderAlbumCover = (url: string): boolean => {
    const trimmed = url.trim();
    if (!trimmed) {
        return true;
    }

    if (DEEZER_EMPTY_COVER_PATH.test(trimmed)) {
        return true;
    }

    const hash = DEEZER_CDN_COVER_PATH.exec(trimmed)?.[1];
    if (hash === undefined) {
        return false;
    }

    const normalized = hash.trim().toLowerCase();
    return normalized.length === 0 || DEEZER_PLACEHOLDER_IMAGE_HASHES.has(normalized);
};

/** Largest-first; Deezer serves the same asset at every size. */
const DEEZER_ALBUM_COVER_FIELDS = ['cover_xl', 'cover_big', 'cover_medium', 'cover_small'] as const;

/**
 * Extracts the numeric Deezer album id from a MusicBrainz url-rel.
 *
 * MusicBrainz files Deezer album links under `free streaming`, so the provider is
 * identified by host, never by relation type. Locale-prefixed paths are accepted.
 */
export const extractDeezerAlbumId = (url: string): string | null => {
    try {
        const parsed = new URL(url);
        if (!isDeezerHost(parsed.hostname.toLowerCase())) {
            return null;
        }

        return DEEZER_ALBUM_PATH.exec(parsed.pathname)?.[1] ?? null;
    } catch {
        return null;
    }
};

type DeezerAlbumLookup = { kind: 'image'; url: string } | { kind: 'miss' } | { kind: 'transient' };

const lookupDeezerAlbumCover = async (
    deezerUrl: string,
    signal?: AbortSignal,
): Promise<DeezerAlbumLookup> => {
    if (isDeezerPaused()) {
        return { kind: 'transient' };
    }

    const albumId = extractDeezerAlbumId(deezerUrl);
    if (!albumId) {
        return { kind: 'miss' };
    }

    let response: unknown;
    try {
        response = await fetchDaprProvider(
            'deezer',
            `/album/${albumId}`,
            { method: 'GET', headers: {} },
            true,
            true,
            'status',
            signal,
            'background',
        );
    } catch (error) {
        if (isAbortError(error)) {
            throw error;
        }

        return { kind: 'transient' };
    }

    if (isFetchFailureResult(response)) {
        return isConfirmedMissingFetchFailure(response) ? { kind: 'miss' } : { kind: 'transient' };
    }

    if (response === null || response === undefined) {
        return { kind: 'transient' };
    }

    const data = response as Record<string, unknown>;
    const errorBody = data.error as { code?: unknown } | undefined;
    if (errorBody && typeof errorBody === 'object') {
        if (errorBody.code === DEEZER_NO_DATA_ERROR_CODE) {
            return { kind: 'miss' };
        }

        if (errorBody.code === DEEZER_QUOTA_ERROR_CODE) {
            getRateLimiter('deezer').setBackoff(DEEZER_QUOTA_BACKOFF_MS);
            logger.warn('deezer quota exhausted; pausing deezer requests', {
                backoffMs: DEEZER_QUOTA_BACKOFF_MS,
            });
            return { kind: 'transient' };
        }

        logger.warn('deezer album returned an error body', {
            albumId,
            code: errorBody.code ?? null,
        });
        return { kind: 'transient' };
    }

    for (const field of DEEZER_ALBUM_COVER_FIELDS) {
        const value = data[field];
        if (typeof value !== 'string') {
            continue;
        }

        const candidate = value.trim();
        if (!candidate || isDeezerRedirectImage(candidate)) {
            continue;
        }

        if (isDeezerPlaceholderAlbumCover(candidate)) {
            // Every size points at the same placeholder asset, so stop probing sizes.
            logger.debug('deezer album has no real cover', { albumId, field });
            return { kind: 'miss' };
        }

        return { kind: 'image', url: candidate };
    }

    return { kind: 'miss' };
};

/**
 * Resolves release artwork from Deezer album links.
 *
 * Like the artist path this walks every candidate for the same release (duplicate
 * Deezer albums happen) and returns the first real cover, distinguishing "no cover"
 * from "lookup failed" so the caller can decide whether to retry.
 */
export const getDeezerAlbumImage = async (
    deezerUrls: string[],
    signal?: AbortSignal,
): Promise<ProviderValueState> => {
    let sawTransientFailure = false;

    for (const deezerUrl of deezerUrls) {
        const lookup = await lookupDeezerAlbumCover(deezerUrl, signal);

        if (lookup.kind === 'image') {
            return lookup.url;
        }

        if (lookup.kind === 'transient') {
            sawTransientFailure = true;
        }
    }

    return sawTransientFailure ? undefined : null;
};

/**
 * Deezer reports "this artist does not exist" as HTTP 200 with an error body
 * rather than a 404, e.g. {"error":{"type":"DataException","message":"no data",
 * "code":800}}. Only this code is treated as a confirmed miss; anything else is
 * transient so a quota or internal error is never cached as "no image".
 */
const DEEZER_NO_DATA_ERROR_CODE = 800;

/**
 * Deezer signals an exhausted per-IP quota this way, again with HTTP 200 and no
 * rate-limit headers, so the wait has to come from the documented 5 second
 * window rather than from the response itself.
 */
const DEEZER_QUOTA_ERROR_CODE = 4;
const DEEZER_QUOTA_BACKOFF_MS = 5000;

/**
 * Checked largest-first: picture_xl is 1000x1000, picture_big 500x500, then
 * picture_medium 250x250 for artists that only publish a mid-size render, with
 * the 120x120 redirect and 56x56 thumbnail as last resorts. Quality wins here:
 * the medium render looked soft on higher-density screens.
 */
const DEEZER_PICTURE_FIELDS = [
    'picture_xl',
    'picture_big',
    'picture_medium',
    'picture',
    'picture_small',
] as const;

/**
 * Deezer does not omit picture fields for artists without artwork: it serves a
 * generic grey silhouette instead. Caching that is worse than caching nothing,
 * because the app then shows Deezer's placeholder rather than its own default.
 *
 * The placeholder sits at a fixed CDN hash: the MD5 of the empty string.
 */
const DEEZER_PLACEHOLDER_IMAGE_HASHES = new Set([
    'd41d8cd98f00b204e9800998ecf8427e',
    'e23066163f21176a822b54001ee648a2',
    'ebcf22e5c3a0eb3178b8a6f6bc1a5a6c',
    '1fecff61b191427ec4d2760a77527bf5',
    '4cc148453373e887d1956b6344a7b04f',
    'ea5412738dfcaf1df3606a5dd3e77e0e',
    'cd3568bb51e7d9e425797f9b4c10b7d3',
    'e7234aeff0081367e7e856b5fd54058e',
    'd0c8b1a4637dff406cc848e3e953dd63',
    'e5c8891f20f2efd5cc8bbfff59ea6efc',
    '96bc2f8cbab605ff6f5bb37e0e383758',
    'f016ad615a7117339f474ee37dca9f38',
    '88a1139d1346a66220b30ea37dca9f38',
    '7a3464a158821d1da6d82f1ce94740ff',
    '415714b66a5de709809dd3d05f58afe4',
    'bb76c2ee3b068726ab4c37b0aabdb57a',
    '58811c62614cff2335b7b925b5011aa0',
    '57c9bec3606bb72c0452f9ff96fa8d07',
    '62bf77663d769e5394d822868d2d8735',
    '7c73d1d63a05e594125d87cf0dc17e44',
    'a69dd9112ef5097c3d2641612791f2ef',
    '456ec1e60024583fd4c3a311ba8286bb',
    '072eba0568ff0fa42d540ce035774780',
    '324f63945fcdfd6bee2dca5416c76fa8',
    '35166c13f464371610f64f33805877ba',
    'd028c6a774e5e24ab384e3141baffbab',
    '762b80d2472f4b1490e307e357c5f790',
    'd21e8382ab5e1fd28b2bb63a13f45f82',
    '4ede85b4d56475a5e0edcb4c3b67c345',
    '1c2cd7a1c69703b1d4adc0eb782b4207',
    '3154bf8ff18c19e1e44a63d17a58ec79',
    '261d12371d6fdd40c3f578bcf90c14df',
    'ff4e14f369cf02544fb150e7bb86f9cc',
    '8b16568eff95a4781f821176f4f734f3',
    '1afc5d48047f775527934cbcfed6fdbd',
    'c77f176737a8f1ce9e38df5f5d3694f3',
    '9c37f6be17341071559a6d4c67afafa4',
]);

const DEEZER_CDN_ARTIST_PATH = /\/images\/artist\/([^/]*)\//i;

/** `picture` is an api.deezer.com redirect, not a CDN url. */
const isDeezerRedirectImage = (url: string): boolean => {
    try {
        return new URL(url).hostname.toLowerCase() === 'api.deezer.com';
    } catch {
        return false;
    }
};

export const isDeezerPlaceholderImage = (url: string): boolean => {
    const hash = DEEZER_CDN_ARTIST_PATH.exec(url)?.[1];
    if (hash === undefined) {
        return false;
    }

    const normalized = hash.trim().toLowerCase();
    return normalized.length === 0 || DEEZER_PLACEHOLDER_IMAGE_HASHES.has(normalized);
};

export const isDeezerPlaceholderAssetUrl = (url: string): boolean =>
    isDeezerPlaceholderImage(url) || isDeezerPlaceholderAlbumCover(url);

type DeezerImageProbe = 'ok' | 'placeholder' | 'missing' | 'unknown';

/**
 * Confirms a Deezer artwork url really serves a photo.
 *
 * Deezer also hands out plausible-looking hashes for artists with no artwork:
 * those answer 302 with a Location pointing at the placeholder asset. The hash
 * check above cannot see that, and Dapr's endpoint invocation follows redirects
 * and drops Location, so this probe goes to the CDN directly. It is a HEAD, so
 * no image bytes are transferred.
 */
const probeDeezerImage = async (url: string, signal?: AbortSignal): Promise<DeezerImageProbe> => {
    const limiter = getRateLimiter('deezerimages');
    const release = await limiter.acquire();

    try {
        const response = await fetch(url, { method: 'HEAD', redirect: 'manual', signal });

        if (response.status === 200) {
            return 'ok';
        }

        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location') ?? '';
            return isDeezerPlaceholderAssetUrl(location) ? 'placeholder' : 'ok';
        }

        return 'missing';
    } catch (error) {
        if (isAbortError(error)) {
            throw error;
        }

        // A probe outage must not cost a real image, so treat it as usable.
        return 'unknown';
    } finally {
        release();
    }
};

const isDeezerHost = (hostname: string): boolean =>
    hostname === 'deezer.com' || hostname.endsWith('.deezer.com');

/**
 * Extracts the numeric Deezer artist id from a MusicBrainz url-rel.
 *
 * MusicBrainz files Deezer links under the generic `free streaming` relation
 * type, not a `deezer` type, so callers must match on the host rather than the
 * relation type. Locale-prefixed paths (/fr/artist/860) are accepted.
 */
export const extractDeezerArtistId = (url: string): string | null => {
    try {
        const parsed = new URL(url);
        if (!isDeezerHost(parsed.hostname.toLowerCase())) {
            return null;
        }

        return DEEZER_ARTIST_PATH.exec(parsed.pathname)?.[1] ?? null;
    } catch {
        return null;
    }
};

const readPictureField = async (
    data: Record<string, unknown>,
    signal?: AbortSignal,
): Promise<string | null> => {
    for (const field of DEEZER_PICTURE_FIELDS) {
        const value = data[field];
        if (typeof value !== 'string') {
            continue;
        }

        const url = value.trim();
        if (!url) {
            continue;
        }

        // The `picture` field redirects to a 120x120 render, and for artists
        // without artwork it redirects to the placeholder, so it can never be
        // trusted as a real image.
        if (isDeezerRedirectImage(url)) {
            continue;
        }

        if (isDeezerPlaceholderImage(url)) {
            continue;
        }

        const probe = await probeDeezerImage(url, signal);
        if (probe === 'ok' || probe === 'unknown') {
            return url;
        }

        if (probe === 'placeholder') {
            // Every size resolves to the same underlying asset, so the other
            // picture fields will redirect to the placeholder too.
            return null;
        }
    }

    return null;
};

/**
 * Resolves one Deezer artist id to a scored candidate.
 *
 * Returns a candidate when the account has real artwork, a miss when it does
 * not, and a transient marker when the answer is worth retrying later.
 */
type DeezerLookup =
    { kind: 'candidate'; candidate: DeezerCandidate } | { kind: 'miss' } | { kind: 'transient' };

type DeezerCandidate = {
    url: string;
    /** Provider-side name, used to prefer the profile that matches MusicBrainz. */
    name: string;
    /** Audience size, the strongest signal of an artist's canonical profile. */
    fans: number;
    albums: number;
};

/**
 * True while Deezer is paused after a quota error.
 *
 * Deezer's quota is per IP and returns HTTP 200 with error code 4, after which every
 * call fails anyway. Sitting in the shared bucket for the whole pause serialised the
 * fallback chain: one quota trip turned 30 cover lookups into 30 x 5s waits. Failing
 * fast lets Tidal/CAA/Discogs answer immediately; the pause still applies to the next
 * real attempt because the bucket keeps its backoff.
 */
const isDeezerPaused = (): boolean => getRateLimiter('deezer').backoffRemainingMs() > 0;

const lookupDeezerArtist = async (
    deezerUrl: string,
    signal?: AbortSignal,
): Promise<DeezerLookup> => {
    if (isDeezerPaused()) {
        return { kind: 'transient' };
    }

    const artistId = extractDeezerArtistId(deezerUrl);
    if (!artistId) {
        // Not a Deezer artist link at all, so there is nothing to retry.
        return { kind: 'miss' };
    }

    const options: HttpOptions = { method: 'GET', headers: {} };

    let response: unknown;
    try {
        response = await fetchDaprProvider(
            'deezer',
            `/artist/${artistId}`,
            options,
            true,
            true,
            'status',
            signal,
            'background',
        );
    } catch (error) {
        if (isAbortError(error)) {
            throw error;
        }

        return { kind: 'transient' };
    }

    if (isFetchFailureResult(response)) {
        return isConfirmedMissingFetchFailure(response) ? { kind: 'miss' } : { kind: 'transient' };
    }

    if (response === null || response === undefined) {
        return { kind: 'transient' };
    }

    const data = response as Record<string, unknown>;
    const errorBody = data.error as { code?: unknown; message?: unknown } | undefined;
    if (errorBody && typeof errorBody === 'object') {
        if (errorBody.code === DEEZER_NO_DATA_ERROR_CODE) {
            return { kind: 'miss' };
        }

        if (errorBody.code === DEEZER_QUOTA_ERROR_CODE) {
            // Quota is per IP, so every Deezer call is failing at once. Pause the
            // shared bucket for the documented window instead of burning requests
            // that are certain to fail; the chain falls through to Tidal meanwhile.
            getRateLimiter('deezer').setBackoff(DEEZER_QUOTA_BACKOFF_MS);
            logger.warn('deezer quota exhausted; pausing deezer requests', {
                backoffMs: DEEZER_QUOTA_BACKOFF_MS,
            });
            return { kind: 'transient' };
        }

        // Unknown error shape: treat as transient and surface it so an
        // unrecognised code is discoverable instead of silently cached.
        logger.warn('deezer returned an error body', {
            artistId,
            code: errorBody.code ?? null,
            message: typeof errorBody.message === 'string' ? errorBody.message : null,
        });
        return { kind: 'transient' };
    }

    const imageUrl = await readPictureField(data, signal);
    if (!imageUrl) {
        return { kind: 'miss' };
    }

    const toCount = (value: unknown): number =>
        typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;

    return {
        kind: 'candidate',
        candidate: {
            url: imageUrl,
            name: typeof data.name === 'string' ? data.name : '',
            fans: toCount(data.nb_fan),
            albums: toCount(data.nb_album),
        },
    };
};

/**
 * Resolves an artist image from Deezer.
 *
 * MusicBrainz often lists several Deezer accounts for one artist, and a stale
 * duplicate keeps a plausible image URL while the active account carries the
 * real audience. Rather than trusting the first link, every candidate is scored
 * and the one with the largest audience wins (nb_fan, then nb_album, then a
 * MusicBrainz name match). A single candidate takes the same path with no extra
 * requests.
 */
export const getDeezerArtistImage = async (
    deezerUrls: string[],
    options: ArtistImageLookupOptions = {},
): Promise<ProviderValueState> => {
    const candidates: DeezerCandidate[] = [];
    let sawTransientFailure = false;

    for (const deezerUrl of deezerUrls) {
        const lookup = await lookupDeezerArtist(deezerUrl, options.signal);

        if (lookup.kind === 'candidate') {
            candidates.push(lookup.candidate);
        } else if (lookup.kind === 'transient') {
            sawTransientFailure = true;
        }
    }

    if (candidates.length === 0) {
        return sawTransientFailure ? undefined : null;
    }

    // Audience size is the ranking signal, because it measures which account is
    // the artist's active profile. A name match is only a tiebreak: provider
    // names legitimately differ from MusicBrainz ("The Roots" vs "Roots"), so
    // letting a name quirk outrank a 30k-follower account would pick a stale
    // profile.
    candidates.sort(
        (left, right) =>
            right.fans - left.fans ||
            right.albums - left.albums ||
            Number(artistNamesMatch(right.name, options.artistName)) -
                Number(artistNamesMatch(left.name, options.artistName)),
    );
    return candidates[0]!.url;
};
