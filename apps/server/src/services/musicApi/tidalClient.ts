import { createLogger } from '../../common/logging/logger.js';
import { artistNamesMatch } from './artistNameMatch.js';
import { getTidalCountryCode, getTidalToken, logTidalTokenRejectedOnce } from './credentials.js';
import { fetchDaprProvider, isAbortError } from './httpClient.js';
import { isConfirmedMissingFetchFailure, isFetchFailureResult } from './types.js';
import type { ArtistImageLookupOptions, HttpOptions, ProviderValueState } from './types.js';

const logger = createLogger('services.musicApi.tidal');

const TIDAL_IMAGE_CDN = 'https://resources.tidal.com';

const TIDAL_ARTIST_PATH = /^\/(?:browse\/)?artist\/(\d+)/i;

/**
 * Largest-first, then medium, then smaller. These are the only sizes Tidal
 * actually serves for artist pictures (verified across a sample of artists):
 * 160, 320, 480 and 750. The 640x640 and 1280x1280 variants return 403 for every
 * uuid probed, so they are not requested.
 */
const TIDAL_IMAGE_SIZES = ['750x750', '480x480', '320x320', '160x160'] as const;

/**
 * The image CDN answers 403 AccessDenied, not 404, for a size that was never
 * rendered. On the CDN both therefore mean "this size does not exist", which is
 * the opposite of the API, where 403 means the token was rejected.
 */
const isMissingImageStatus = (status: number | null): boolean =>
    status === 403 || status === 404 || status === 410;

const isTidalHost = (hostname: string): boolean =>
    hostname === 'tidal.com' || hostname.endsWith('.tidal.com');

/**
 * Extracts the numeric Tidal artist id from a MusicBrainz url-rel.
 *
 * MusicBrainz files Tidal links under the generic `streaming` relation type, not
 * a `tidal` type, so callers must match on the host rather than the relation
 * type. Both /artist/9706 and /browse/artist/9706 are accepted.
 */
export const extractTidalArtistId = (url: string): string | null => {
    try {
        const parsed = new URL(url);
        if (!isTidalHost(parsed.hostname.toLowerCase())) {
            return null;
        }

        return TIDAL_ARTIST_PATH.exec(parsed.pathname)?.[1] ?? null;
    } catch {
        return null;
    }
};

/**
 * HEAD-checks one rendered size.
 *
 * Returns true when the image exists, false when it definitively does not, and
 * undefined when the probe itself failed transiently.
 */
const probeTidalImageSize = async (
    basePath: string,
    size: string,
    signal?: AbortSignal,
): Promise<boolean | undefined> => {
    const options: HttpOptions = { method: 'HEAD', headers: {} };

    let response: unknown;
    try {
        response = await fetchDaprProvider(
            'tidalimages',
            `/images/${basePath}/${size}.jpg`,
            options,
            false,
            true,
            'status',
            signal,
            'background',
        );
    } catch (error) {
        if (isAbortError(error)) {
            throw error;
        }

        return undefined;
    }

    // fetchDaprProvider resolves HEAD requests to `true` when the response is ok.
    if (response === true) {
        return true;
    }

    if (isFetchFailureResult(response)) {
        return isMissingImageStatus(response.status) ? false : undefined;
    }

    return undefined;
};

/**
 * Finds the largest rendered size for a Tidal picture uuid.
 *
 * Tidal hands back a uuid, not a url; the artwork lives at
 * {uuid-with-dashes-as-slashes}/{size}.jpg and only some sizes exist.
 */
export const buildValidTidalImageUrl = async (
    pictureUuid: string,
    signal?: AbortSignal,
): Promise<ProviderValueState> => {
    const basePath = pictureUuid.replace(/-/g, '/');
    let sawTransientFailure = false;

    for (const size of TIDAL_IMAGE_SIZES) {
        const exists = await probeTidalImageSize(basePath, size, signal);

        if (exists === true) {
            return `${TIDAL_IMAGE_CDN}/images/${basePath}/${size}.jpg`;
        }

        if (exists === undefined) {
            sawTransientFailure = true;
        }
    }

    if (sawTransientFailure) {
        return undefined;
    }

    // Every size was probed and none exists for this uuid.
    return null;
};

/**
 * Resolves one Tidal artist id to an image url.
 */
type TidalLookup =
    { kind: 'candidate'; candidate: TidalCandidate } | { kind: 'miss' } | { kind: 'transient' };

type TidalCandidate = { url: string; name: string };

const lookupTidalArtist = async (tidalUrl: string, signal?: AbortSignal): Promise<TidalLookup> => {
    const artistId = extractTidalArtistId(tidalUrl);
    if (!artistId) {
        // Not a Tidal artist link at all, so there is nothing to retry.
        return { kind: 'miss' };
    }

    const countryCode = getTidalCountryCode();
    const options: HttpOptions = {
        method: 'GET',
        headers: { 'x-tidal-token': await getTidalToken() },
    };

    let response: unknown;
    try {
        response = await fetchDaprProvider(
            'tidal',
            `/v1/artists/${artistId}?countryCode=${encodeURIComponent(countryCode)}`,
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
        // Captured before the narrowing below: isConfirmedMissingFetchFailure is
        // a guard to the same type, so the else branch would collapse to never.
        const status = response.status;

        // 404/410: Tidal answered and this artist is not in its catalogue under
        // the configured country. That is a confirmed miss, not an outage, so it
        // must not be retried forever.
        if (isConfirmedMissingFetchFailure(response)) {
            return { kind: 'miss' };
        }

        // 401/403 means the token was rejected or revoked, which affects every
        // Tidal-linked artist, so it is an operational event rather than per-artist
        // noise. 429/5xx and transport errors are ordinary transient failures.
        // Either way the lookup is worth retrying.
        if (status === 401 || status === 403) {
            logTidalTokenRejectedOnce(status);
        } else {
            logger.debug('tidal artist lookup failed transiently', { artistId, status });
        }
        return { kind: 'transient' };
    }

    if (response === null || response === undefined) {
        return { kind: 'transient' };
    }

    const record = response as { picture?: unknown; name?: unknown };
    const picture = record.picture;
    if (typeof picture !== 'string' || picture.trim().length === 0) {
        // The artist exists on Tidal but has no artwork attached.
        return { kind: 'miss' };
    }

    const imageUrl = await buildValidTidalImageUrl(picture.trim(), signal);
    if (imageUrl === undefined) {
        return { kind: 'transient' };
    }

    if (imageUrl === null) {
        return { kind: 'miss' };
    }

    return {
        kind: 'candidate',
        candidate: { url: imageUrl, name: typeof record.name === 'string' ? record.name : '' },
    };
};

/**
 * Resolves an artist image from Tidal.
 *
 * Tidal exposes no audience metric comparable to Deezer's fan count, so rather
 * than rank on a weak signal this only prefers the profile whose name matches
 * MusicBrainz and otherwise keeps MusicBrainz's order. That handles the common
 * case of a stale duplicate without pretending popularity is decisive here.
 */
export const getTidalArtistImage = async (
    tidalUrls: string[],
    options: ArtistImageLookupOptions = {},
): Promise<ProviderValueState> => {
    const candidates: TidalCandidate[] = [];
    let sawTransientFailure = false;

    for (const tidalUrl of tidalUrls) {
        const lookup = await lookupTidalArtist(tidalUrl, options.signal);

        if (lookup.kind === 'candidate') {
            candidates.push(lookup.candidate);
        } else if (lookup.kind === 'transient') {
            sawTransientFailure = true;
        }
    }

    if (candidates.length === 0) {
        return sawTransientFailure ? undefined : null;
    }

    const named = candidates.find((candidate) =>
        artistNamesMatch(candidate.name, options.artistName),
    );

    return (named ?? candidates[0]!).url;
};
