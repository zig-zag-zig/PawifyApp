import { cacheConfig } from '../../config/runtimeConfig.js';
import { createLogger } from '../../common/logging/logger.js';
import { getCachedData, replaceCachedData } from '../cacheService.js';
import type { CoverState, LyricsState } from '../../utils/types/cacheTypes.js';
import {
    shouldRefetchRemoteState,
    TRANSIENT_REMOTE_VALUE_RETRY_WINDOW_MS,
} from '../../utils/helpers/remoteStateHelpers.js';
import { isRemoteValueState } from '../../common/utils/objectGuards.js';

const logger = createLogger('services.cache.assetCache');

/**
 * Per-entity asset cache.
 *
 * One key per artist image, release-group cover, release cover and track lyric,
 * instead of one aggregate map per artist/release. The aggregate maps rewrote every
 * entry whenever a single item resolved, which is what made the old cache both
 * chatty and stale-prone. Values are tiny state objects, so the number of reads per
 * screen is bounded by the number of items on that screen.
 */
export const ASSET_TTL_HOURS = {
    /** Provider artwork and lyrics rarely change; a month is enough to save calls. */
    success: cacheConfig.assetSuccessTtlHours,
    /** A confirmed absence is worth remembering, but not forever. */
    miss: cacheConfig.assetMissTtlHours,
} as const;

export const assetKeys = {
    artistImage: (artistId: string): string => `asset:artist-image:${artistId}`,
    groupCover: (releaseGroupId: string): string => `asset:group-cover:${releaseGroupId}`,
    releaseCover: (releaseId: string): string => `asset:release-cover:${releaseId}`,
    trackLyrics: (releaseId: string, trackId: string): string =>
        `asset:lyrics:${releaseId}:${trackId}`,
};

type RemoteState = CoverState | LyricsState;

const isUsable = (state: RemoteState | null): state is RemoteState =>
    !!state &&
    isRemoteValueState(state.url) &&
    (state.url !== null || state.confirmedMiss === true) &&
    !shouldRefetchRemoteState(state, Date.now());

const ttlFor = (state: RemoteState): number =>
    state.url === null && state.confirmedMiss === true
        ? ASSET_TTL_HOURS.miss
        : ASSET_TTL_HOURS.success;

export const readAssetState = async <T extends RemoteState>(key: string): Promise<T | null> => {
    try {
        const state = await getCachedData<T>(key);
        return state && isUsable(state) ? state : null;
    } catch (error) {
        logger.debug('asset cache read failed; treating as unresolved', { key, error });
        return null;
    }
};

export const writeAssetState = async (key: string, state: RemoteState): Promise<void> => {
    try {
        await replaceCachedData(key, state, ttlFor(state));
    } catch (error) {
        logger.warn('asset cache write failed', { key, error });
    }
};

/**
 * State for a transient provider failure: retry soon, do not cache as a miss.
 */
export const transientAssetState = (): RemoteState => ({
    url: undefined,
    nextRefetchAt: Date.now() + TRANSIENT_REMOTE_VALUE_RETRY_WINDOW_MS,
});

/**
 * Reads several asset keys at once with bounded concurrency.
 *
 * Screens ask for a page of assets; issuing them one at a time would serialise Dapr
 * round trips, and issuing all of them at once would open too many connections.
 */
export const readAssetStates = async <T extends RemoteState>(
    keys: readonly string[],
    concurrency = 8,
): Promise<Map<string, T>> => {
    const result = new Map<string, T>();
    const queue = [...keys];
    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
        for (let key = queue.shift(); key !== undefined; key = queue.shift()) {
            const state = await readAssetState<T>(key);
            if (state) {
                result.set(key, state);
            }
        }
    });

    await Promise.all(workers);
    return result;
};
