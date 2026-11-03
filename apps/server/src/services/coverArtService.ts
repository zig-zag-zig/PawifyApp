import { mapCoverState } from '../utils/helpers/remoteStateHelpers.js';
import { TRANSIENT_REMOTE_VALUE_RETRY_WINDOW_MS } from '../utils/helpers/remoteStateHelpers.js';
import type { RemoteValueState } from '@pawify/shared';
import type { CoverState } from '../utils/types/cacheTypes.js';
import { isRemoteValueState } from '../common/utils/objectGuards.js';
import {
    readGroupCoverState,
    readReleaseCoverState,
    writeGroupCoverState,
    writeReleaseCoverState,
} from './coverArt/coverArtCache.js';
import { readAssetStates, assetKeys } from './cache/assetCache.js';
import { fetchReleaseCover, fetchReleaseGroupCover } from './coverArt/coverArtLookup.js';
import { dedupeStrings } from '../common/utils/array.js';

export type CoverLookupResult = {
    state: CoverState;
    isFallback: boolean;
};

const hasUsableUrl = (state: CoverState | null | undefined): boolean =>
    typeof state?.url === 'string' && state.url.trim().length > 0;

/**
 * A fallback cover that was found while the primary lookup failed transiently keeps a
 * retry window, so the better image is picked up later instead of being pinned for a
 * month.
 */
const fallbackCoverState = (url: string, primaryWasTransient: boolean): CoverState =>
    primaryWasTransient
        ? { url, nextRefetchAt: Date.now() + TRANSIENT_REMOTE_VALUE_RETRY_WINDOW_MS }
        : mapCoverState(url);

const cachedReleaseCoverFromIds = async (
    releaseIds: readonly string[],
): Promise<CoverState | null> => {
    const keys = dedupeStrings([...releaseIds]).map((releaseId) =>
        assetKeys.releaseCover(releaseId),
    );
    if (keys.length === 0) {
        return null;
    }

    const states = await readAssetStates<CoverState>(keys);
    for (const state of states.values()) {
        if (hasUsableUrl(state)) {
            return state;
        }
    }

    return null;
};

/**
 * Release-group cover.
 *
 * One cache entry per group (`asset:group-cover:{id}`) rather than a map per artist.
 * The provider chain is Deezer → Tidal → Cover Art Archive, so the slow archive.org
 * redirect is only paid when neither streaming provider has the album.
 */
export const getReleaseGroupCover = async (
    _artistId: string | undefined,
    releaseGroupId: string,
    fallbackReleaseIds: string[],
    ttl: number | undefined,
    signal?: AbortSignal,
    _artistCoverCacheContext?: unknown,
    aggregatedProviderUrls?: { deezerUrls: string[]; tidalUrls: string[] },
): Promise<CoverLookupResult> => {
    const cached = await readGroupCoverState(releaseGroupId);
    if (cached && hasUsableUrl(cached)) {
        return { state: cached, isFallback: false };
    }

    // A release in the same group may already have a real cover; reuse it before
    // spending provider calls.
    const peerCover = await cachedReleaseCoverFromIds(fallbackReleaseIds);
    if (peerCover) {
        const state = mapCoverState(peerCover.url);
        await writeGroupCoverState(releaseGroupId, state, ttl);
        return { state, isFallback: true };
    }

    const direct = await fetchReleaseGroupCover(
        releaseGroupId,
        signal,
        fallbackReleaseIds,
        aggregatedProviderUrls,
    );

    if (typeof direct === 'string' && direct.trim().length > 0) {
        const state = mapCoverState(direct);
        await writeGroupCoverState(releaseGroupId, state, ttl);
        return { state, isFallback: false };
    }

    const state = mapCoverState(direct);
    await writeGroupCoverState(releaseGroupId, state, ttl);
    return { state, isFallback: false };
};

/**
 * Release cover.
 *
 * A release's own cover wins; a sibling/group cover is an acceptable fallback so the
 * UI does not show an empty tile for a pressing that simply has no artwork uploaded.
 */
export const getReleaseCover = async (
    releaseId: string,
    releaseGroupId: string | null,
    ttl: number | undefined,
    signal?: AbortSignal,
    providerUrls?: { deezerUrls: string[]; tidalUrls: string[] },
): Promise<CoverLookupResult> => {
    const cached = await readReleaseCoverState(releaseId);
    if (cached && hasUsableUrl(cached)) {
        return { state: cached, isFallback: false };
    }

    const direct = await fetchReleaseCover(releaseId, releaseGroupId, signal, providerUrls);

    if (typeof direct === 'string' && direct.trim().length > 0) {
        const state = mapCoverState(direct);
        await writeReleaseCoverState(releaseId, state, ttl);
        if (releaseGroupId) {
            // A real release cover is also a valid group cover; recording it saves the
            // group lookup a provider call.
            await writeGroupCoverState(releaseGroupId, state, ttl);
        }
        return { state, isFallback: false };
    }

    if (releaseGroupId) {
        const groupCover = await readGroupCoverState(releaseGroupId);
        if (groupCover && hasUsableUrl(groupCover)) {
            const state = fallbackCoverState(
                groupCover.url as string,
                isRemoteValueState(direct) && direct === undefined,
            );
            await writeReleaseCoverState(releaseId, state, ttl);
            return { state, isFallback: true };
        }
    }

    const state = mapCoverState(direct);
    await writeReleaseCoverState(releaseId, state, ttl);
    return { state, isFallback: false };
};

export type { RemoteValueState };
