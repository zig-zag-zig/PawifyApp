import type { Release, ReleaseGroupReleaseListItem } from '@pawify/shared';
import { replaceCachedData, getCachedData } from '../cacheService.js';
import type {
    CachedArtistReleases,
    CachedReleaseGroupReleases,
} from '../../utils/types/cacheTypes.js';
import {
    mapReleaseGroupsToArtistReleases,
    normalizeReleaseGroups,
} from '../../utils/helpers/releaseGroupingHelpers.js';
import {
    getCacheKey,
    RELEASE_GROUP_RELEASES_CACHE_SUFFIX,
} from '../../utils/helpers/cacheHelpers.js';
import { mapWithConcurrency } from '../../utils/helpers/promisePool.js';
import {
    createCachedArtistReleaseGroups,
    createCachedReleaseGroupReleases,
} from '../../utils/helpers/artistReleaseCacheHelpers.js';
import {
    fetchAllReleasesForArtist,
    fetchAllReleasesForReleaseGroup,
    mapReleaseGroupReleasesList,
    processAndGroupReleases,
} from './releaseQueries.js';

type GetReleaseGroupReleasesOptions = {
    onReleaseIdsPage?: (
        releaseGroupId: string,
        releaseIds: string[],
        isLastPage: boolean,
    ) => Promise<void> | void;
};

export const getArtistReleases = async (
    artistId: string,
    ttl: number | undefined,
): Promise<CachedArtistReleases> => {
    const cacheKey = getCacheKey(artistId, 'artistReleases');
    const cached = await getCachedData<CachedArtistReleases>(cacheKey);

    if (cached) {
        return cached;
    }

    return await fetchAndCacheArtistReleases(artistId, cacheKey, cached, ttl);
};

const fetchAndCacheArtistReleases = async (
    artistId: string,
    cacheKey: string,
    cached: CachedArtistReleases | null,
    ttl: number | undefined,
): Promise<CachedArtistReleases> => {
    try {
        return await fetchAndCacheUncachedArtistReleases(artistId, cached, cacheKey, ttl);
    } catch (error) {
        throw Object.assign(new Error('Failed to fetch releases'), { cause: error });
    }
};

const fetchAndCacheUncachedArtistReleases = async (
    artistId: string,
    cached: CachedArtistReleases | null,
    cacheKey: string,
    ttl: number | undefined,
): Promise<CachedArtistReleases> => {
    const allReleases = await fetchAllReleasesForArtist(artistId, false);

    const releaseGroupsMap = processAndGroupReleases(allReleases);
    normalizeReleaseGroups(releaseGroupsMap);

    const artistReleaseGroups = mapReleaseGroupsToArtistReleases(releaseGroupsMap);
    const cachedGroups = createCachedArtistReleaseGroups(artistReleaseGroups, cached);

    await cacheReleaseGroupReleasesByGroup(releaseGroupsMap, ttl);
    await replaceCachedData(cacheKey, cachedGroups, ttl);

    return cachedGroups;
};

const cacheReleaseGroupReleasesByGroup = async (
    releaseGroupsMap: Map<string, Release[]>,
    ttl: number | undefined,
): Promise<void> => {
    await mapWithConcurrency(
        Array.from(releaseGroupsMap.entries()),
        10,
        async ([groupId, releases]) => {
            const cacheKey = getCacheKey(groupId, RELEASE_GROUP_RELEASES_CACHE_SUFFIX);
            const cached = await getCachedData<CachedReleaseGroupReleases>(cacheKey);
            const cachedReleases = createCachedReleaseGroupReleases(releases, cached);
            await replaceCachedData(cacheKey, cachedReleases, ttl);
        },
    );
};

export const getReleaseGroupReleases = async (
    releaseGroupId: string,
    useCache: boolean,
    ttl: number | undefined,
    options?: GetReleaseGroupReleasesOptions,
): Promise<ReleaseGroupReleaseListItem[]> => {
    const cacheKey = getCacheKey(releaseGroupId, RELEASE_GROUP_RELEASES_CACHE_SUFFIX);
    const cached = await getCachedData<CachedReleaseGroupReleases>(cacheKey);

    if (useCache && cached) {
        await options?.onReleaseIdsPage?.(
            releaseGroupId,
            cached.map((release) => release.id),
            true,
        );
        return mapReleaseGroupReleasesList(cached);
    }

    const releases = await fetchAndCacheReleaseGroupReleases(
        releaseGroupId,
        cacheKey,
        ttl,
        options,
    );
    return mapReleaseGroupReleasesList(releases);
};

const fetchAndCacheReleaseGroupReleases = async (
    releaseGroupId: string,
    cacheKey: string,
    ttl: number | undefined,
    options?: GetReleaseGroupReleasesOptions,
): Promise<Release[]> => {
    const allReleases = await fetchAllReleasesForReleaseGroup(releaseGroupId);
    const cachedReleases = createCachedReleaseGroupReleases(allReleases, null);
    await replaceCachedData(cacheKey, cachedReleases, ttl);
    await options?.onReleaseIdsPage?.(
        releaseGroupId,
        cachedReleases.map((release) => release.id),
        true,
    );

    return cachedReleases;
};
