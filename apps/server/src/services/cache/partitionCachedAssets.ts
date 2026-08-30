import { createLogger } from '../../common/logging/logger.js';
import { getCacheKey } from '../../utils/helpers/cacheHelpers.js';
import { mapWithConcurrency } from '../../utils/helpers/promisePool.js';
import type {
    CachedArtistImage,
    CachedArtistReleaseGroupCovers,
    CachedReleaseGroupReleaseCovers,
    CachedReleaseLyricsByRelease,
} from '../../utils/types/cacheTypes.js';
import type {
    ArtistProfileImageLookup,
    ReleaseGroupPageEntry,
    ReleaseGroupReleasesPageEntry,
    TrackLyricsRequest,
} from '../../utils/types/taskTypes.js';
import { getCachedData } from '../cacheService.js';
import { shouldUseCachedState } from '../coverArt/coverArtLookup.js';
import {
    shouldRefetchArtistImageState,
    shouldRefetchState,
} from '../tasks/backgroundTaskMappers.js';

const logger = createLogger('services.cache.partitionAssets');

const PRE_RESOLVE_CONCURRENCY = 8;

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
 * Splits track lyrics requests into cached and pending sets using the same
 * freshness rules as the lyrics background worker.
 */
export const partitionTrackLyrics = async (
    releaseId: string,
    tracks: TrackLyricsRequest[],
    readCache: CacheReader = getCachedData,
): Promise<CachedAssetPartition<TrackLyricsRequest>> => {
    const startedAt = Date.now();
    const resolved: Record<string, string | null> = {};
    const pending: TrackLyricsRequest[] = [];

    let cached: CachedReleaseLyricsByRelease | null = null;
    try {
        cached = await readCache<CachedReleaseLyricsByRelease>(
            getCacheKey(releaseId, 'releaseLyrics'),
        );
    } catch (error) {
        logger.debug('lyrics cache read failed; treating all tracks as pending', {
            releaseId,
            error,
        });
    }

    for (const track of tracks) {
        const state = cached?.[track.trackId];

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
 * Splits release-group release cover page entries into cached and pending
 * sets. Pending entries keep only the unresolved release ids.
 */
export const partitionReleaseGroupReleaseCovers = async (
    pageEntries: ReleaseGroupReleasesPageEntry[],
    readCache: CacheReader = getCachedData,
): Promise<CachedAssetPartition<ReleaseGroupReleasesPageEntry>> => {
    const startedAt = Date.now();
    const resolved: Record<string, string | null> = {};
    const pending: ReleaseGroupReleasesPageEntry[] = [];

    await mapWithConcurrency(pageEntries, PRE_RESOLVE_CONCURRENCY, async (entry) => {
        let cache: CachedReleaseGroupReleaseCovers = {};
        try {
            cache =
                (await readCache<CachedReleaseGroupReleaseCovers>(
                    getCacheKey(entry.releaseGroupId, 'releaseGroupReleaseCovers'),
                )) ?? {};
        } catch (error) {
            logger.debug('release cover cache read failed; treating entry as pending', {
                releaseGroupId: entry.releaseGroupId,
                error,
            });
        }

        const unresolvedReleaseIds: string[] = [];

        for (const releaseId of entry.releaseIds) {
            const state = cache[releaseId];

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
    });

    const totalCount = pageEntries.reduce((sum, entry) => sum + entry.releaseIds.length, 0);
    logPreResolved(
        'release_group_release_covers',
        totalCount,
        Object.keys(resolved).length,
        startedAt,
    );
    return { resolved, pending };
};

/**
 * Splits artist release-group cover entries into cached and pending sets
 * using the artist-level cover cache.
 */
export const partitionArtistReleaseGroupCovers = async (
    artistId: string,
    pageEntries: ReleaseGroupPageEntry[],
    readCache: CacheReader = getCachedData,
): Promise<CachedAssetPartition<ReleaseGroupPageEntry>> => {
    const startedAt = Date.now();
    const resolved: Record<string, string | null> = {};
    const pending: ReleaseGroupPageEntry[] = [];

    let cache: CachedArtistReleaseGroupCovers = {};
    try {
        cache =
            (await readCache<CachedArtistReleaseGroupCovers>(
                getCacheKey(artistId, 'artistReleaseGroupCovers'),
            )) ?? {};
    } catch (error) {
        logger.debug(
            'artist release-group cover cache read failed; treating all entries as pending',
            { artistId, error },
        );
    }

    for (const entry of pageEntries) {
        const state = cache[entry.releaseGroupId];

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
