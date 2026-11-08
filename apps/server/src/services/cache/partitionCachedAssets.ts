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
import {
    readEntityImages,
    type EntityImageEntityType,
    type EntityImageRecord,
} from '../../infrastructure/musicDb/entityImageRepository.js';
import { musicDbHasEntityImages } from '../../infrastructure/musicDb/musicDbClient.js';
import {
    resolveEntityImageFreshness,
    scheduleEntityImageRevalidation,
} from '../musicApi/entityImageFreshness.js';
import { resolveArtistImage } from '../musicApi/artistImageSources.js';
import { fetchReleaseCover, fetchReleaseGroupCover } from '../coverArt/coverArtLookup.js';
import { getArtistImageProviderLinksFromMirror } from '../../infrastructure/musicDb/musicDbRepositories.js';

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
 * Reads artwork rows from `mb.db` for a batch of entities and converts them into the
 * partition shape the callers already expect.
 *
 * Returns null when the mirror does not carry the image-state tables, which is the
 * signal to fall back to the Redis cache path.
 */
const readMirrorImages = (
    entityType: EntityImageEntityType,
    ids: readonly string[],
): Map<string, EntityImageRecord> | null => {
    if (!musicDbHasEntityImages()) {
        return null;
    }
    return readEntityImages(entityType, ids);
};

/**
 * Applies the freshness matrix to one mirrored row.
 *
 * A row that is due for a re-check is still returned immediately; the re-check is
 * detached background work, so a page never waits on it. `null` means "go through the
 * live path" (`pending`, or no row at all).
 */
const mirrorValue = (
    record: EntityImageRecord | undefined,
    entityType: EntityImageEntityType,
    entityId: string,
    resolve: () => Promise<string | null | undefined>,
): { value: string | null } | null => {
    if (!record) {
        return null;
    }

    const freshness = resolveEntityImageFreshness(entityType, record);
    if (!freshness) {
        return null;
    }

    if (freshness.revalidate) {
        scheduleEntityImageRevalidation(entityType, entityId, resolve, {
            settlePermanent: freshness.settlePermanent,
        });
    }

    return { value: record.service === 'none' ? null : record.url };
};

export const partitionArtistProfileImages = async (
    lookups: ArtistProfileImageLookup[],
    readCache: CacheReader = getCachedData,
): Promise<CachedAssetPartition<ArtistProfileImageLookup>> => {
    const startedAt = Date.now();
    const resolved: Record<string, string | null> = {};
    const pending: ArtistProfileImageLookup[] = [];

    const artistIds = lookups
        .map((lookup) => lookup.artistId)
        .filter(
            (artistId): artistId is string => typeof artistId === 'string' && artistId.length > 0,
        );
    const mirror = readMirrorImages('artist', artistIds);

    await mapWithConcurrency(lookups, PRE_RESOLVE_CONCURRENCY, async (lookup) => {
        if (!lookup.artistId) {
            pending.push(lookup);
            return;
        }

        if (mirror) {
            const artistId = lookup.artistId;
            const mirrored = mirrorValue(mirror.get(artistId), 'artist', artistId, async () => {
                const links = getArtistImageProviderLinksFromMirror(artistId);
                const refreshed = await resolveArtistImage({
                    artistId,
                    artistName: lookup.artistName ?? links?.artistName,
                    deezerUrls: lookup.deezerUrls ?? links?.deezerUrls,
                    tidalUrls: lookup.tidalUrls ?? links?.tidalUrls,
                    discogsUrls: lookup.discogsUrls ?? links?.discogsUrls,
                    bypassMirror: true,
                });
                return refreshed.image;
            });
            if (mirrored) {
                resolved[artistId] = mirrored.value;
                return;
            }
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

    const mirror = readMirrorImages('release', allReleaseIds);
    const keys = mirror ? [] : allReleaseIds.map((releaseId) => assetKeys.releaseCover(releaseId));
    const states = mirror
        ? new Map<string, CoverState>()
        : await readStates<CoverState>(keys, readCache);
    // Groups that already hold a cover are the fallback for their pressings; a
    // release without its own artwork inherits it, exactly like the live chain.
    const groupIds = pageEntries
        .map((entry) => entry.releaseGroupId)
        .filter((groupId): groupId is string => typeof groupId === 'string' && groupId.length > 0);
    const groupMirror = readMirrorImages('release_group', groupIds);

    for (const entry of pageEntries) {
        const unresolvedReleaseIds: string[] = [];
        const groupRecord = entry.releaseGroupId
            ? groupMirror?.get(entry.releaseGroupId)
            : undefined;
        const groupFallback =
            groupRecord && groupRecord.service !== 'none' && groupRecord.service !== 'pending'
                ? groupRecord.url
                : null;
        const groupUnresolved =
            Boolean(entry.releaseGroupId) && (!groupRecord || groupRecord.service === 'pending');

        for (const releaseId of entry.releaseIds) {
            if (mirror) {
                const mirrored = mirrorValue(mirror.get(releaseId), 'release', releaseId, () =>
                    fetchReleaseCover(releaseId, null, undefined, undefined, {
                        bypassMirror: true,
                    }),
                );
                if (mirrored) {
                    if (mirrored.value !== null) {
                        resolved[releaseId] = mirrored.value;
                        continue;
                    }
                    if (groupFallback !== null) {
                        resolved[releaseId] = groupFallback;
                        continue;
                    }
                    if (!groupUnresolved) {
                        resolved[releaseId] = null;
                        continue;
                    }
                }
                unresolvedReleaseIds.push(releaseId);
                continue;
            }

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

    const groupIds = pageEntries.map((entry) => entry.releaseGroupId);
    const mirror = readMirrorImages('release_group', groupIds);
    const keys = mirror ? [] : groupIds.map((groupId) => assetKeys.groupCover(groupId));
    const states = mirror
        ? new Map<string, CoverState>()
        : await readStates<CoverState>(keys, readCache);

    for (const entry of pageEntries) {
        if (mirror) {
            const mirrored = mirrorValue(
                mirror.get(entry.releaseGroupId),
                'release_group',
                entry.releaseGroupId,
                () =>
                    fetchReleaseGroupCover(entry.releaseGroupId, undefined, undefined, undefined, {
                        bypassMirror: true,
                    }),
            );
            if (mirrored) {
                resolved[entry.releaseGroupId] = mirrored.value;
                continue;
            }
            pending.push(entry);
            continue;
        }

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
