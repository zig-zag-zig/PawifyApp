import { createLogger } from '../../common/logging/logger.js';
import { getDeezerAlbumImage } from './deezerClient.js';
import { getTidalAlbumImage } from './tidalClient.js';
import { getCoverArtArchiveUrl } from './coverArtArchiveClient.js';
import { lookupMirrorImage } from './mirrorEntityImages.js';
import { scheduleEntityImageRevalidation, settleEntityImageMiss } from './entityImageFreshness.js';
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
    /** Ignore the mirror rows and always walk the providers. */
    bypassMirror?: boolean;
    /**
     * Image URLs already proven broken on the CDN. A provider returning one of
     * these is treated as a transient failure so the chain falls through to the
     * next provider instead of stopping on the dead URL or marking a permanent miss.
     */
    excludeUrls?: ReadonlySet<string>;
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

const resolvedMirrorResolution = (mirrored: {
    url: string;
    service: EntityImageService;
}): ReleaseImageResolution | null => {
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
 * gets from the Cover Art Archive group endpoint. A confirmed miss is only trusted
 * when both verdicts are recorded, because a pressing with no art inherits its
 * group's cover.
 *
 * Stale rows are still answered immediately: the re-check is scheduled here as
 * detached background work, so a request never waits on it.
 */
const resolveMirroredReleaseImage = (lookup: ReleaseImageLookup): ReleaseImageResolution | null => {
    const releaseMirror = lookupMirrorImage('release', lookup.releaseId);
    if (releaseMirror.kind === 'resolved') {
        scheduleReleaseRevalidation(releaseMirror.freshness, lookup, releaseMirror.service);
        return resolvedMirrorResolution(releaseMirror);
    }

    const groupMirror = lookupMirrorImage('release_group', lookup.releaseGroupId);
    if (groupMirror.kind === 'resolved') {
        scheduleReleaseRevalidation(groupMirror.freshness, lookup, groupMirror.service);
        return resolvedMirrorResolution(groupMirror);
    }

    if (releaseMirror.kind === 'missing' && groupMirror.kind === 'missing') {
        scheduleMissRevalidation(releaseMirror.freshness, 'release', lookup.releaseId, () =>
            resolveReleaseImage({ ...lookup, releaseGroupId: undefined }),
        );
        scheduleMissRevalidation(
            groupMirror.freshness,
            'release_group',
            lookup.releaseGroupId,
            () => resolveReleaseImage({ ...lookup, releaseId: undefined, bypassMirror: true }),
        );
        return missingMirrorResolution();
    }

    return null;
};

const scheduleReleaseRevalidation = (
    freshness: { revalidate: boolean },
    lookup: ReleaseImageLookup,
    service: EntityImageService,
): void => {
    if (!freshness.revalidate) {
        return;
    }
    // Only artist-style (time-limited) rows reach this branch; covers are permanent.
    if (service !== 'deezer' && service !== 'tidal') {
        return;
    }
    scheduleEntityImageRevalidation('release', lookup.releaseId ?? '', async () => {
        const result = await resolveReleaseImage({
            ...lookup,
            releaseGroupId: undefined,
            bypassMirror: true,
        });
        return result.image;
    });
};

const scheduleMissRevalidation = (
    freshness: { revalidate: boolean; settlePermanent: boolean },
    entityType: 'release' | 'release_group',
    entityId: string | undefined,
    resolve: () => Promise<ReleaseImageResolution>,
): void => {
    if (!entityId || !freshness.revalidate) {
        return;
    }

    scheduleEntityImageRevalidation(entityType, entityId, async () => {
        const result = await resolve();
        if (freshness.settlePermanent && (result.image === null || result.image === undefined)) {
            settleEntityImageMiss(entityType, entityId);
        }
        return result.image;
    });
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
    const mirrored = lookup.bypassMirror ? null : resolveMirroredReleaseImage(lookup);
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

    const isUsableImage = (image: ProviderValueState): image is string =>
        hasImage(image) && !lookup.excludeUrls?.has(image.trim());

    const recordExcludedOrMiss = (provider: ReleaseImageProvider, image: ProviderValueState) => {
        if (hasImage(image) && lookup.excludeUrls?.has(image.trim())) {
            transientFailures.push(provider);
            return;
        }
        record(provider, image);
    };

    if (hasUrls(lookup.deezerUrls)) {
        const image = await getDeezerAlbumImage(lookup.deezerUrls, lookup.signal);
        if (isUsableImage(image)) {
            return { image, source: 'deezer', confirmedMisses, transientFailures };
        }
        recordExcludedOrMiss('deezer', image);
    }

    if (hasUrls(lookup.tidalUrls)) {
        const image = await getTidalAlbumImage(lookup.tidalUrls, lookup.signal);
        if (isUsableImage(image)) {
            return { image, source: 'tidal', confirmedMisses, transientFailures };
        }
        recordExcludedOrMiss('tidal', image);
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

        if (isUsableImage(image)) {
            return { image, source: 'coverartarchive', confirmedMisses, transientFailures };
        }
        recordExcludedOrMiss('coverartarchive', image);
    }

    return {
        image: transientFailures.length > 0 ? undefined : null,
        source: undefined,
        confirmedMisses,
        transientFailures,
    };
};
