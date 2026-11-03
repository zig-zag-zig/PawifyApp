import { createLogger } from '../../common/logging/logger.js';
import { getDeezerAlbumImage } from './deezerClient.js';
import { getTidalAlbumImage } from './tidalClient.js';
import { getCoverArtArchiveUrl } from './coverArtArchiveClient.js';
import type { ProviderValueState, ReleaseImageProvider } from './types.js';

const logger = createLogger('services.musicApi.releaseImageSources');

/**
 * Resolution order for release/release-group artwork.
 *
 * Cover Art Archive is last on purpose: it answers with a 307 to Internet Archive
 * storage, and that second hop is the slow, sometimes-unavailable part. The
 * streaming providers answer directly from their own CDNs.
 */
export const RELEASE_IMAGE_PROVIDER_ORDER: readonly ReleaseImageProvider[] = [
    'deezer',
    'tidal',
    'coverartarchive',
];

export type ReleaseImageLookup = {
    /** Deezer album urls from the release's MusicBrainz url-rels. */
    deezerUrls?: string[];
    /** Tidal album urls from the release's MusicBrainz url-rels. */
    tidalUrls?: string[];
    /** Release id, for the Cover Art Archive release endpoint. */
    releaseId?: string;
    /** Release-group id, for the Cover Art Archive group endpoint. */
    releaseGroupId?: string;
    signal?: AbortSignal;
};

export type ReleaseImageResolution = {
    image: ProviderValueState;
    source: ReleaseImageProvider | undefined;
    confirmedMisses: ReleaseImageProvider[];
    transientFailures: ReleaseImageProvider[];
};

const hasUrls = (urls: string[] | undefined): urls is string[] =>
    Array.isArray(urls) && urls.length > 0;

const hasImage = (image: ProviderValueState): image is string =>
    typeof image === 'string' && image.trim().length > 0;

/**
 * Walks the artwork provider chain and stops at the first usable image.
 *
 * Uses the repo-wide tri-state: a transient failure anywhere makes the overall
 * lookup transient (retried after the cache cooldown) unless a later provider found
 * an image, while every provider answering "definitely no artwork" is a confirmed
 * miss that is cached and not retried until it expires.
 *
 * Cover Art Archive is only consulted when the streaming providers are absent or
 * exhausted, and a transient CAA answer does not trigger a second CAA probe: the
 * caller gets `undefined` and retries the whole chain after the cooldown.
 */
export const resolveReleaseImage = async (
    lookup: ReleaseImageLookup,
): Promise<ReleaseImageResolution> => {
    const confirmedMisses: ReleaseImageProvider[] = [];
    const transientFailures: ReleaseImageProvider[] = [];

    const record = (provider: ReleaseImageProvider, image: ProviderValueState) => {
        if (image === undefined) {
            transientFailures.push(provider);
        } else {
            confirmedMisses.push(provider);
        }
    };

    if (hasUrls(lookup.deezerUrls)) {
        const image = await getDeezerAlbumImage(lookup.deezerUrls, lookup.signal);
        if (hasImage(image)) {
            return { image, source: 'deezer', confirmedMisses, transientFailures };
        }
        record('deezer', image);
    }

    if (hasUrls(lookup.tidalUrls)) {
        const image = await getTidalAlbumImage(lookup.tidalUrls, lookup.signal);
        if (hasImage(image)) {
            return { image, source: 'tidal', confirmedMisses, transientFailures };
        }
        record('tidal', image);
    }

    const caaPath = lookup.releaseGroupId
        ? `/release-group/${lookup.releaseGroupId}/front`
        : lookup.releaseId
          ? `/release/${lookup.releaseId}/front`
          : null;

    if (caaPath) {
        let image: ProviderValueState;
        try {
            image = await getCoverArtArchiveUrl(caaPath, lookup.signal);
        } catch (error) {
            logger.warn('cover art archive lookup failed', {
                path: caaPath,
                error: error instanceof Error ? error.message : String(error),
            });
            image = undefined;
        }

        if (hasImage(image)) {
            return { image, source: 'coverartarchive', confirmedMisses, transientFailures };
        }
        record('coverartarchive', image);
    }

    return {
        image: transientFailures.length > 0 ? undefined : null,
        source: undefined,
        confirmedMisses,
        transientFailures,
    };
};
