import { mapCoverState, TRANSIENT_REMOTE_VALUE_RETRY_WINDOW_MS } from '../utils/helpers/remoteStateHelpers.js';
import type { RemoteValueState } from '@pawify/shared';
import type { CoverState } from '../utils/types/cacheTypes.js';
import { isRemoteValueState } from '../common/utils/objectGuards.js';
import { lookupMirrorImage } from './musicApi/mirrorEntityImages.js';
import { fetchReleaseCover, fetchReleaseGroupCover } from './coverArt/coverArtLookup.js';

export type CoverLookupResult = {
    state: CoverState;
    isFallback: boolean;
};

/**
 * A fallback cover found while the primary lookup failed transiently keeps a retry
 * window, so the better image is picked up later instead of being pinned for months.
 */
const fallbackCoverState = (url: string, primaryWasTransient: boolean): CoverState =>
    primaryWasTransient
        ? { url, nextRefetchAt: Date.now() + TRANSIENT_REMOTE_VALUE_RETRY_WINDOW_MS }
        : mapCoverState(url);

/**
 * Release-group cover from the mirror-backed provider chain.
 *
 * Artwork state is stored in `entity_images`; there is no Redis artwork cache to
 * read or write.
 */
export const getReleaseGroupCover = async (
    _artistId: string | undefined,
    releaseGroupId: string,
    fallbackReleaseIds: string[],
    _ttl: number | undefined,
    signal?: AbortSignal,
    _artistCoverCacheContext?: unknown,
    aggregatedProviderUrls?: { deezerUrls: string[]; tidalUrls: string[] },
): Promise<CoverLookupResult> => {
    const direct = await fetchReleaseGroupCover(
        releaseGroupId,
        signal,
        fallbackReleaseIds,
        aggregatedProviderUrls,
    );

    return { state: mapCoverState(direct), isFallback: false };
};

/** Release cover: own artwork wins; the group cover is the fallback. */
export const getReleaseCover = async (
    releaseId: string,
    releaseGroupId: string | null,
    _ttl: number | undefined,
    signal?: AbortSignal,
    providerUrls?: { deezerUrls: string[]; tidalUrls: string[] },
): Promise<CoverLookupResult> => {
    const direct = await fetchReleaseCover(releaseId, releaseGroupId, signal, providerUrls);

    if (typeof direct === 'string' && direct.trim().length > 0) {
        return { state: mapCoverState(direct), isFallback: false };
    }

    if (releaseGroupId) {
        const mirroredGroup = lookupMirrorImage('release_group', releaseGroupId);
        if (mirroredGroup.kind === 'resolved') {
            return {
                state: fallbackCoverState(
                    mirroredGroup.url,
                    isRemoteValueState(direct) && direct === undefined,
                ),
                isFallback: true,
            };
        }
    }

    return { state: mapCoverState(direct), isFallback: false };
};

export type { RemoteValueState };
