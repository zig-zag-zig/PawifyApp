import { createLogger } from '../../common/logging/logger.js';
import { getCacheKey } from '../../utils/helpers/cacheHelpers.js';
import { mapWithConcurrency } from '../../utils/helpers/promisePool.js';
import type { CachedArtistImage, CoverState, LyricsState } from '../../utils/types/cacheTypes.js';
import type {
    ArtistProfileImageLookup,
    ReleaseGroupPageEntry,
    ReleaseGroupReleasesPageEntry,
    TrackLyricsRequest,
} from '../../utils/types/taskTypes.js';
import { getCachedData } from '../cacheService.js';
import { assetKeys } from './assetCache.js';
import { shouldUseCachedState } from '../coverArt/coverArtLookup.js';
import {
    shouldRefetchArtistImageState,
    shouldRefetchState,
} from '../tasks/backgroundTaskMappers.js';

const logger = createLogger('services.cache.partitionAssets');

const PRE_RESOLVE_CONCURRENCY = 8;

/**
 * Reads several asset keys through the injectable reader with bounded concurrency.
 *
 * Kept here rather than in assetCache so tests can substitute the reader and the
 * freshness rules stay identical to the worker's.
 */
const readStates = async <T extends CoverState | LyricsState>(
    keys: readonly string[],
    readCache: CacheReader,
): Promise<Map<string, T>> => {
    const result = new Map<string, T>();
    const queue = [...keys];
    const workers = Array.from(
        { length: Math.min(PRE_RESOLVE_CONCURRENCY, queue.length) },
        async () => {
            for (let key = queue.shift(); key !== undefined; key = queue.shift()) {
                try {
                    const state = await readCache<T>(key);
                    if (state) {
                        result.set(key, state);
                    }
                } catch (error) {
                    logger.debug('asset cache read failed; treating as pending', { key, error });
                }
            }
        },
    );

    await Promise.all(workers);
    return result;
};

export type CachedAssetPartition<TPending> = {
    /** Items already resolvable from cache: URL strings or confirmed nulls. */
    resolved: Record<string, string | null>;
    /** Items that still need background work. */
    pending: TPending[];
};

type CacheReader = <T>(key: string) => Promise<T | null>;

const toResolvedValue = (url: string | null | undefined): string | null | undefined => {
    if (typeof url === 'string' && url.trim().length > 0) {
        return url;
    }

    if (url === null) {
        return null;
    }

    return undefined;
};

const logPreResolved = (
    assetType: string,
    totalCount: number,
    resolvedCount: number,
    startedAt: number,
): void => {
    if (totalCount === 0) {
        return;
    }

    logger.info('background asset pre-resolution completed', {
        assetType,
        itemCount: totalCount,
        resolvedCount,
        pendingCount: totalCount - resolvedCount,
        durationMs: Date.now() - startedAt,
    });
};

/**
 * Splits artist profile image lookups into cached (string/null URLs) and
 * pending sets using the same freshness rules as the background worker.
 */
export const partitionArtistProfileImages = async (
    lookups: ArtistProfileImageLookup[],
    readCache: CacheReader = getCachedData,
): Promise<CachedAssetPartition<ArtistProfileImageLookup>> => {
    const startedAt = Date.now();
    const resolved: Record<string, string | null> = {};
    const pending: ArtistProfileImageLookup[] = [];

    await mapWithConcurrency(lookups, PRE_RESOLVE_CONCURRENCY, async (lookup) => {
        if (!lookup.artistId) {
            pending.push(lookup);
            return;
        }

        try {
            const cached = await readCache<CachedArtistImage>(
                getCacheKey(lookup.artistId, 'artistImages'),
            );
            if (cached && !shouldRefetchArtistImageState(cached)) {
                const value = toResolvedValue(cached.url);
                if (value !== undefined) {
                    resolved[lookup.artistId] = value;
                    return;
                }
            }
        } catch (error) {
            logger.debug('artist image cache read failed; treating as pending', {
                artistId: lookup.artistId,
                error,
            });
        }

        pending.push(lookup);
    });

    logPreResolved(
        'artist_profile_images',
        lookups.length,
        Object.keys(resolved).length,
        startedAt,
    );
    return { resolved, pending };
};

/**
 * Splits track lyrics requests into cached and pending sets.
 *
 * Lyrics are cached per track (`asset:lyrics:{releaseId}:{trackId}`), so one track
 * resolving does not rewrite the whole release's map.
 */
export const partitionTrackLyrics = async (
    releaseId: string,
    tracks: TrackLyricsRequest[],
    readCache: CacheReader = getCachedData,
): Promise<CachedAssetPartition<TrackLyricsRequest>> => {
    const startedAt = Date.now();
    const resolved: Record<string, string | null> = {};
    const pending: TrackLyricsRequest[] = [];

    const keys = tracks.map((track) => assetKeys.trackLyrics(releaseId, track.trackId));
    const states = await readStates<LyricsState>(keys, readCache);

    for (const track of tracks) {
        const state = states.get(assetKeys.trackLyrics(releaseId, track.trackId));

        if (state && !shouldRefetchState(state)) {
            const value = toResolvedValue(state.url);
            if (value !== undefined) {
                resolved[track.trackId] = value;
                continue;
            }
        }

        pending.push(track);
    }

    logPreResolved('release_tracks_lyrics', tracks.length, Object.keys(resolved).length, startedAt);
    return { resolved, pending };
};

/**
 * Splits release-group release cover page entries into cached and pending sets.
 *
 * Covers are cached per release (`asset:release-cover:{id}`), so the page reads one
 * key per release instead of a group-sized map. Reads are batched to keep the Dapr
 * round trips bounded.
 */
export const partitionReleaseGroupReleaseCovers = async (
    pageEntries: ReleaseGroupReleasesPageEntry[],
    readCache: CacheReader = getCachedData,
): Promise<CachedAssetPartition<ReleaseGroupReleasesPageEntry>> => {
    const startedAt = Date.now();
    const resolved: Record<string, string | null> = {};
    const pending: ReleaseGroupReleasesPageEntry[] = [];
    const allReleaseIds = pageEntries.flatMap((entry) => entry.releaseIds);
    const keys = allReleaseIds.map((releaseId) => assetKeys.releaseCover(releaseId));

    const states = await readStates<CoverState>(keys, readCache);

    for (const entry of pageEntries) {
        const unresolvedReleaseIds: string[] = [];

        for (const releaseId of entry.releaseIds) {
            const state = states.get(assetKeys.releaseCover(releaseId));
            if (state && shouldUseCachedState(state)) {
                const value = toResolvedValue(state.url);
                if (value !== undefined) {
                    resolved[releaseId] = value;
                    continue;
                }
            }

            unresolvedReleaseIds.push(releaseId);
        }

        if (unresolvedReleaseIds.length > 0) {
            pending.push({
                releaseGroupId: entry.releaseGroupId,
                releaseIds: unresolvedReleaseIds,
            });
        }
    }

    logPreResolved(
        'release_group_release_covers',
        allReleaseIds.length,
        Object.keys(resolved).length,
        startedAt,
    );
    return { resolved, pending };
};

/**
 * Splits artist release-group cover entries into cached and pending sets.
 *
 * One key per release group (`asset:group-cover:{id}`), not one map per artist, so a
 * resolved group never rewrites the whole artist's covers.
 */
export const partitionArtistReleaseGroupCovers = async (
    artistId: string,
    pageEntries: ReleaseGroupPageEntry[],
    readCache: CacheReader = getCachedData,
): Promise<CachedAssetPartition<ReleaseGroupPageEntry>> => {
    const startedAt = Date.now();
    const resolved: Record<string, string | null> = {};
    const pending: ReleaseGroupPageEntry[] = [];

    const keys = pageEntries.map((entry) => assetKeys.groupCover(entry.releaseGroupId));
    const states = await readStates<CoverState>(keys, readCache);

    for (const entry of pageEntries) {
        const state = states.get(assetKeys.groupCover(entry.releaseGroupId));
        if (state && shouldUseCachedState(state)) {
            const value = toResolvedValue(state.url);
            if (value !== undefined) {
                resolved[entry.releaseGroupId] = value;
                continue;
            }
        }

        pending.push(entry);
    }

    logPreResolved(
        'release_group_covers',
        pageEntries.length,
        Object.keys(resolved).length,
        startedAt,
    );
    return { resolved, pending };
};

export interface AssetCachePartitioner {
    partitionArtistProfileImages(
        lookups: ArtistProfileImageLookup[],
    ): Promise<CachedAssetPartition<ArtistProfileImageLookup>>;
    partitionTrackLyrics(
        releaseId: string,
        tracks: TrackLyricsRequest[],
    ): Promise<CachedAssetPartition<TrackLyricsRequest>>;
    partitionReleaseGroupReleaseCovers(
        pageEntries: ReleaseGroupReleasesPageEntry[],
    ): Promise<CachedAssetPartition<ReleaseGroupReleasesPageEntry>>;
    partitionArtistReleaseGroupCovers(
        artistId: string,
        pageEntries: ReleaseGroupPageEntry[],
    ): Promise<CachedAssetPartition<ReleaseGroupPageEntry>>;
}

export const cacheAssetPartitioner: AssetCachePartitioner = {
    partitionArtistProfileImages,
    partitionTrackLyrics,
    partitionReleaseGroupReleaseCovers,
    partitionArtistReleaseGroupCovers,
};
