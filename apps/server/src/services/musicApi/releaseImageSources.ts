import { createLogger } from '../../common/logging/logger.js';
import { getDeezerAlbumImage } from './deezerClient.js';
import { getTidalAlbumImage } from './tidalClient.js';
import { getCoverArtArchiveUrl } from './coverArtArchiveClient.js';
import { lookupMirrorImage, type MirrorImage } from './mirrorEntityImages.js';
import type { EntityImageService } from '../../infrastructure/musicDb/entityImageRepository.js';
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

/**
 * Maps a mirrored service onto the provider names this module reports.
 *
 * Both Cover Art Archive variants are the same provider from the caller's point
 * of view: `caa_rel` is the pressing's front cover, `caa_rg` the group's.
 */
const mirroredSource = (service: EntityImageService): ReleaseImageProvider | undefined => {
    if (service === 'caa_rel' || service === 'caa_rg') {
        return 'coverartarchive';
    }
    if (service === 'deezer' || service === 'tidal') {
        return service;
    }
    return undefined;
};

const resolvedMirrorResolution = (
    mirrored: Extract<MirrorImage, { kind: 'resolved' }>,
): ReleaseImageResolution | null => {
    const source = mirroredSource(mirrored.service);
    if (!source) {
        return null;
    }
    return {
        image: mirrored.url,
        source,
        confirmedMisses: [],
        transientFailures: [],
    };
};

const missingMirrorResolution = (): ReleaseImageResolution => ({
    image: null,
    source: undefined,
    confirmedMisses: [...RELEASE_IMAGE_PROVIDER_ORDER],
    transientFailures: [],
});

/**
 * Artwork the mirror already answered for this release, or null to run the chain.
 *
 * The release's own row wins; its group's row is the same fallback the live chain
 * gets from the Cover Art Archive group endpoint. A confirmed miss on one of them
 * is only returned when the other has nothing better, so an artist pressing with
 * no art still inherits its group cover.
 */
const resolveMirroredReleaseImage = (lookup: ReleaseImageLookup): ReleaseImageResolution | null => {
    const releaseMirror = lookupMirrorImage('release', lookup.releaseId);
    const groupMirror = lookupMirrorImage('release_group', lookup.releaseGroupId);

    if (releaseMirror.kind === 'resolved') {
        return resolvedMirrorResolution(releaseMirror);
    }
    if (groupMirror.kind === 'resolved') {
        return resolvedMirrorResolution(groupMirror);
    }

    // A confirmed miss is only authoritative together with the group verdict: a
    // pressing with no art inherits its group's cover, so an absent group row must
    // still let the chain probe the group endpoint once.
    if (releaseMirror.kind === 'missing' && groupMirror.kind !== 'none') {
        return missingMirrorResolution();
    }
    if (releaseMirror.kind === 'none' && groupMirror.kind === 'missing') {
        return missingMirrorResolution();
    }

    return null;
};

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
    // The mirror is a snapshot of what these same providers answered, so a hit is
    // the answer itself: no rate-limited request, no CloudFront redirect.
    const mirrored = resolveMirroredReleaseImage(lookup);
    if (mirrored) {
        return mirrored;
    }

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
