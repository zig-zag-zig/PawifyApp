import { createLogger } from '../../common/logging/logger.js';
import { artistNamesMatch } from './artistNameMatch.js';
import { fetchDaprProvider, isAbortError } from './httpClient.js';
import { getRateLimiter } from './rateLimiter.js';
import { isConfirmedMissingFetchFailure, isFetchFailureResult } from './types.js';
import type { ArtistImageLookupOptions, HttpOptions, ProviderValueState } from './types.js';

const logger = createLogger('services.musicApi.deezer');

const DEEZER_ARTIST_PATH = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?artist\/(\d+)/i;

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
const DEEZER_PLACEHOLDER_IMAGE_HASHES = new Set(['d41d8cd98f00b204e9800998ecf8427e']);

const DEEZER_CDN_ARTIST_PATH = /\/images\/artist\/([^/]*)\//i;

/** `picture` is an api.deezer.com redirect, not a CDN url. */
const isDeezerRedirectImage = (url: string): boolean => {
    try {
        return new URL(url).hostname.toLowerCase() === 'api.deezer.com';
    } catch {
        return false;
    }
};

const isDeezerPlaceholderImage = (url: string): boolean => {
    const hash = DEEZER_CDN_ARTIST_PATH.exec(url)?.[1];
    if (hash === undefined) {
        return false;
    }

    const normalized = hash.trim().toLowerCase();
    return normalized.length === 0 || DEEZER_PLACEHOLDER_IMAGE_HASHES.has(normalized);
};

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
            return isDeezerPlaceholderImage(location) ? 'placeholder' : 'ok';
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

const lookupDeezerArtist = async (
    deezerUrl: string,
    signal?: AbortSignal,
): Promise<DeezerLookup> => {
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
