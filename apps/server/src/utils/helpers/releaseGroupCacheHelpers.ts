import type { ArtistReleaseGroup, Release } from '@pawify/shared';
import { deleteCachedData, getCachedData, replaceCachedData } from '../../services/cacheService.js';
import type { CachedArtistReleases, CachedReleaseGroupReleases } from '../types/cacheTypes.js';
import { createCachedReleaseGroupReleases } from './artistReleaseCacheHelpers.js';
import { getCacheKey } from './cacheHelpers.js';
import {
    groupByReleaseGroup,
    mapReleaseGroupsToArtistReleases,
    normalizeReleaseGroups,
} from './releaseGroupingHelpers.js';

type RebuildReleaseGroupCacheOptions = {
    groupId: string;
    deletedReleaseIds?: string[];
    artistNewReleases?: Release[];
    fallbackGroup?: ArtistReleaseGroup;
    ttl?: number;
};

export const collectChangedReleaseGroupIds = (
    artistReleasesCache: CachedArtistReleases,
    deletedReleaseIds: string[],
    artistNewReleases: Release[],
): Set<string> => {
    const deletedReleaseIdsSet = new Set(deletedReleaseIds);
    const changedGroupIds = new Set<string>();

    for (const releaseGroup of artistReleasesCache) {
        if (releaseGroup.releaseIds.some((releaseId) => deletedReleaseIdsSet.has(releaseId))) {
            changedGroupIds.add(releaseGroup.id);
        }
    }

    for (const release of artistNewReleases) {
        const releaseGroupId = release['release-group']?.id;
        if (releaseGroupId) {
            changedGroupIds.add(releaseGroupId);
        }
    }

    return changedGroupIds;
};

export const rebuildReleaseGroupCache = async ({
    groupId,
    deletedReleaseIds = [],
    artistNewReleases = [],
    fallbackGroup,
    ttl,
}: RebuildReleaseGroupCacheOptions): Promise<ArtistReleaseGroup | null> => {
    const groupCacheKey = getCacheKey(groupId, 'releaseGroupReleases');
    const cachedReleases = await getCachedData<CachedReleaseGroupReleases>(groupCacheKey);

    if (!cachedReleases && fallbackGroup) {
        const releaseIds = fallbackGroup.releaseIds.filter((id) => !deletedReleaseIds.includes(id));
        return releaseIds.length > 0 ? { ...fallbackGroup, releaseIds } : null;
    }

    const releasesForGroup = mergeGroupReleases(
        cachedReleases,
        deletedReleaseIds,
        artistNewReleases,
        groupId,
    );

    if (releasesForGroup.length === 0) {
        await deleteCachedData(groupCacheKey);
        return null;
    }

    const releaseGroupsMap = groupByReleaseGroup(releasesForGroup);
    normalizeReleaseGroups(releaseGroupsMap);

    const normalizedReleases =
        releaseGroupsMap.get(groupId) ?? Array.from(releaseGroupsMap.values())[0] ?? [];
    const cachedGroupReleases = createCachedReleaseGroupReleases(
        normalizedReleases,
        cachedReleases,
    );
    await replaceCachedData(groupCacheKey, cachedGroupReleases, ttl);

    return mapReleaseGroupsToArtistReleases(releaseGroupsMap)[0] ?? null;
};

const mergeGroupReleases = (
    cachedReleases: CachedReleaseGroupReleases | null,
    deletedReleaseIds: string[],
    artistNewReleases: Release[],
    groupId: string,
): Release[] => {
    const deletedReleaseIdsSet = new Set(deletedReleaseIds);
    const mergedReleases = new Map<string, Release>();

    for (const release of cachedReleases ?? []) {
        if (!deletedReleaseIdsSet.has(release.id)) {
            mergedReleases.set(release.id, release);
        }
    }

    for (const release of artistNewReleases) {
        if (release['release-group']?.id === groupId) {
            mergedReleases.set(release.id, release);
        }
    }

    return Array.from(mergedReleases.values());
};
