import { getCoverArtArchiveUrl } from '../musicApi/coverArtArchiveClient.js';
import {
    mapCoverState,
    shouldRefetchRemoteState,
    TRANSIENT_REMOTE_VALUE_RETRY_WINDOW_MS,
} from '../../utils/helpers/remoteStateHelpers.js';
import type { RemoteValueState } from '../../modules/models/models.js';
import type { CachedReleaseGroupReleaseCovers, CoverState } from '../../utils/types/cacheTypes.js';
import { dedupeStrings } from '../../common/utils/array.js';
import { isRemoteValueState } from '../../common/utils/objectGuards.js';
import { readReleaseCoverCache, writeReleaseCoverCache } from './coverArtCache.js';

export type CoverLookupResult = {
    state: CoverState;
    isFallback: boolean;
};

export const hasUsableUrl = (url: RemoteValueState): url is string =>
    typeof url === 'string' && url.trim().length > 0;

export const shouldUseCachedState = (
    state: CoverState | undefined,
    now: number = Date.now(),
): state is CoverState =>
    !!state &&
    isRemoteValueState(state.url) &&
    (state.url !== null || state.confirmedMiss === true) &&
    !shouldRefetchRemoteState(state, now);

export const resolveMiss = (values: RemoteValueState[]): null | undefined =>
    values.some((value) => value === undefined) ? undefined : null;

export const mapResolvedCoverState = (
    url: RemoteValueState,
    isFallback: boolean,
    primaryMisses: RemoteValueState[],
): CoverState => {
    if (hasUsableUrl(url) && isFallback && primaryMisses.some((value) => value === undefined)) {
        return {
            url,
            nextRefetchAt: Date.now() + TRANSIENT_REMOTE_VALUE_RETRY_WINDOW_MS,
        };
    }

    return mapCoverState(url);
};

export const fetchReleaseCoverFromCaa = async (
    releaseId: string,
    signal?: AbortSignal,
): Promise<RemoteValueState> => {
    return await getCoverArtArchiveUrl(`/release/${releaseId}/front`, signal);
};

export const fetchReleaseGroupCoverFromCaa = async (
    releaseGroupId: string,
    signal?: AbortSignal,
): Promise<RemoteValueState> => {
    return await getCoverArtArchiveUrl(`/release-group/${releaseGroupId}/front`, signal);
};

export const pickCachedPeerReleaseCover = (
    cache: CachedReleaseGroupReleaseCovers,
    releaseId: string,
    now: number,
): CoverState | undefined => {
    for (const [cachedReleaseId, state] of Object.entries(cache)) {
        if (
            cachedReleaseId === releaseId ||
            !shouldUseCachedState(state, now) ||
            !hasUsableUrl(state.url)
        ) {
            continue;
        }

        return state;
    }

    return undefined;
};

export const pickCachedReleaseCoverFromIds = (
    cache: CachedReleaseGroupReleaseCovers,
    releaseIds: string[],
    now: number,
): CoverState | undefined => {
    for (const releaseId of dedupeStrings(releaseIds)) {
        const state = cache[releaseId];
        if (!shouldUseCachedState(state, now) || !hasUsableUrl(state.url)) {
            continue;
        }

        return state;
    }

    return undefined;
};

export const pickAnyCachedReleaseCover = (
    cache: CachedReleaseGroupReleaseCovers,
    now: number,
): CoverState | undefined => {
    for (const state of Object.values(cache)) {
        if (!shouldUseCachedState(state, now) || !hasUsableUrl(state.url)) {
            continue;
        }

        return state;
    }

    return undefined;
};

export const hasUnseenFallbackReleaseIds = (
    cache: CachedReleaseGroupReleaseCovers,
    releaseIds: string[],
): boolean => {
    for (const releaseId of dedupeStrings(releaseIds)) {
        if (!cache[releaseId]) {
            return true;
        }
    }

    return false;
};

export const getFallbackReleaseCover = async (
    releaseGroupId: string,
    releaseIds: string[],
    ttl: number | undefined,
    signal?: AbortSignal,
    inheritedMisses: RemoteValueState[] = [],
): Promise<CoverLookupResult> => {
    const uniqueReleaseIds = dedupeStrings(releaseIds);
    const cache = await readReleaseCoverCache(releaseGroupId);
    const now = Date.now();
    const misses: RemoteValueState[] = [...inheritedMisses];
    let changed = false;

    for (const releaseId of uniqueReleaseIds) {
        const current = cache[releaseId];

        if (shouldUseCachedState(current, now)) {
            if (hasUsableUrl(current.url)) {
                if (changed) {
                    await writeReleaseCoverCache(releaseGroupId, cache, ttl);
                }

                return {
                    state: current,
                    isFallback: true,
                };
            }

            misses.push(current.url);
            continue;
        }

        const fetched = await fetchReleaseCoverFromCaa(releaseId, signal);
        const state = mapCoverState(fetched);
        cache[releaseId] = state;
        changed = true;

        if (hasUsableUrl(state.url)) {
            await writeReleaseCoverCache(releaseGroupId, cache, ttl);
            return {
                state,
                isFallback: true,
            };
        }

        misses.push(state.url);
    }

    if (changed) {
        await writeReleaseCoverCache(releaseGroupId, cache, ttl);
    }

    return {
        state: mapCoverState(resolveMiss(misses)),
        isFallback: true,
    };
};
