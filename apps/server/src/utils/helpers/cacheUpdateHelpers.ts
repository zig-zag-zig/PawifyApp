import { ArtistReleaseGroup, Release } from '../../modules/models/models.js';
import { dateToTimestamp } from '../../modules/utils/dateUtil.js';
import { getCachedData, replaceCachedData } from '../../services/cacheService.js';
import type { CachedArtistReleases, CachedReleaseGroupReleaseCovers } from '../types/cacheTypes.js';
import { createCachedArtistReleaseGroups } from './artistReleaseCacheHelpers.js';
import { getCacheKey } from './cacheHelpers.js';
import {
    collectChangedReleaseGroupIds,
    rebuildReleaseGroupCache,
} from './releaseGroupCacheHelpers.js';
import { mapWithConcurrency } from './promisePool.js';

const REBUILD_CHANGED_GROUPS_CONCURRENCY = 10;
const PRUNE_RELEASE_COVER_CACHES_CONCURRENCY = 10;

export const updateArtistCacheIfExists = async (
    artistId: string,
    deletedReleaseIds: string[],
    artistNewReleases: Release[],
    ttl: number | undefined,
): Promise<void> => {
    const cacheKey = getCacheKey(artistId, 'artistReleases');
    const artistReleasesCache = await getCachedData<CachedArtistReleases>(cacheKey);
    const changedGroupIds = collectChangedReleaseGroupIds(
        artistReleasesCache ?? [],
        deletedReleaseIds,
        artistNewReleases,
    );
    const deletedReleaseIdsByGroupId = collectReleaseIdsByGroupId(
        artistReleasesCache ?? [],
        deletedReleaseIds,
    );

    if (changedGroupIds.size === 0) {
        return;
    }

    const rebuiltGroupsById = await rebuildChangedGroups(
        changedGroupIds,
        deletedReleaseIds,
        artistNewReleases,
        artistReleasesCache ?? [],
        ttl,
    );

    if (!artistReleasesCache) {
        return;
    }

    const updatedCache = await updateArtistReleasesCache(
        artistReleasesCache,
        changedGroupIds,
        rebuiltGroupsById,
    );

    await replaceCachedData(cacheKey, updatedCache, ttl);
    await pruneReleaseCoverCaches(deletedReleaseIdsByGroupId, ttl);
};

const collectReleaseIdsByGroupId = (
    artistReleasesCache: CachedArtistReleases,
    releaseIds: string[],
): Map<string, Set<string>> => {
    const releaseIdsToRemove = new Set(releaseIds);
    const releaseIdsByGroupId = new Map<string, Set<string>>();

    for (const releaseGroup of artistReleasesCache) {
        for (const releaseId of releaseGroup.releaseIds) {
            if (!releaseIdsToRemove.has(releaseId)) {
                continue;
            }

            const groupReleaseIds = releaseIdsByGroupId.get(releaseGroup.id) ?? new Set<string>();
            groupReleaseIds.add(releaseId);
            releaseIdsByGroupId.set(releaseGroup.id, groupReleaseIds);
        }
    }

    return releaseIdsByGroupId;
};

const pruneReleaseCoverCaches = async (
    releaseIdsByGroupId: Map<string, Set<string>>,
    ttl: number | undefined,
): Promise<void> => {
    await mapWithConcurrency(
        Array.from(releaseIdsByGroupId.entries()),
        PRUNE_RELEASE_COVER_CACHES_CONCURRENCY,
        async ([groupId, releaseIds]) => {
            const cacheKey = getCacheKey(groupId, 'releaseGroupReleaseCovers');
            const cache = await getCachedData<CachedReleaseGroupReleaseCovers>(cacheKey);

            if (!cache) {
                return;
            }

            let changed = false;
            for (const releaseId of releaseIds) {
                if (cache[releaseId]) {
                    delete cache[releaseId];
                    changed = true;
                }
            }

            if (changed) {
                await replaceCachedData(cacheKey, cache, ttl);
            }
        },
    );
};

const updateArtistReleasesCache = async (
    artistReleasesCache: CachedArtistReleases,
    changedGroupIds: Set<string>,
    rebuiltGroupsById: Map<string, ArtistReleaseGroup>,
): Promise<CachedArtistReleases> => {
    const unchangedGroups = artistReleasesCache.filter(
        (releaseGroup) => !changedGroupIds.has(releaseGroup.id),
    );
    const mergedGroups = [...unchangedGroups, ...rebuiltGroupsById.values()].sort(
        (left, right) => dateToTimestamp(right.date) - dateToTimestamp(left.date),
    );

    return createCachedArtistReleaseGroups(mergedGroups, artistReleasesCache);
};

const rebuildChangedGroups = async (
    changedGroupIds: Set<string>,
    deletedReleaseIds: string[],
    artistNewReleases: Release[],
    artistReleasesCache: CachedArtistReleases,
    ttl: number | undefined,
): Promise<Map<string, ArtistReleaseGroup>> => {
    const rebuiltGroups = await mapWithConcurrency(
        Array.from(changedGroupIds),
        REBUILD_CHANGED_GROUPS_CONCURRENCY,
        async (groupId) => ({
            groupId,
            rebuiltGroup: await rebuildChangedGroup(
                groupId,
                deletedReleaseIds,
                artistNewReleases,
                artistReleasesCache.find((group) => group.id === groupId),
                ttl,
            ),
        }),
    );

    return new Map(
        rebuiltGroups.flatMap(({ groupId, rebuiltGroup }) =>
            rebuiltGroup ? [[groupId, rebuiltGroup] as const] : [],
        ),
    );
};

const rebuildChangedGroup = async (
    groupId: string,
    deletedReleaseIds: string[],
    artistNewReleases: Release[],
    fallbackGroup?: ArtistReleaseGroup,
    ttl?: number,
): Promise<ArtistReleaseGroup | null> => {
    return await rebuildReleaseGroupCache({
        groupId,
        deletedReleaseIds,
        artistNewReleases,
        fallbackGroup,
        ttl,
    });
};
