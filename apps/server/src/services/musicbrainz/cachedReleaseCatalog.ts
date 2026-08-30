import type { Release, ReleaseGroupReleaseListItem } from '../../modules/models/models.js';
import { replaceCachedData, getCachedData } from '../cacheService.js';
import type {
    CachedArtistReleases,
    CachedReleaseGroupReleaseCovers,
    CachedReleaseGroupReleases,
} from '../../utils/types/cacheTypes.js';
import {
    mapReleaseGroupsToArtistReleases,
    normalizeReleaseGroups,
} from '../../utils/helpers/releaseGroupingHelpers.js';
import { getCacheKey } from '../../utils/helpers/cacheHelpers.js';
import { mapWithConcurrency } from '../../utils/helpers/promisePool.js';
import {
    createCachedArtistReleaseGroups,
    createCachedReleaseGroupReleases,
} from '../../utils/helpers/artistReleaseCacheHelpers.js';
import {
    dedupeAndSortReleaseGroupReleases,
    fetchAllReleaseIdsForArtist,
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
            const cacheKey = getCacheKey(groupId, 'releaseGroupReleases');
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
    const cacheKey = getCacheKey(releaseGroupId, 'releaseGroupReleases');
    const cached = await getCachedData<CachedReleaseGroupReleases>(cacheKey);

    if (useCache && cached && canUseCachedReleaseGroupReleases(cached)) {
        const normalizedCached = await normalizeCachedReleaseGroupReleases(
            releaseGroupId,
            cacheKey,
            cached,
            ttl,
        );
        await options?.onReleaseIdsPage?.(
            releaseGroupId,
            normalizedCached.map((release) => release.id),
            true,
        );
        return mapReleaseGroupReleasesList(normalizedCached);
    }

    const releases = await fetchAndCacheReleaseGroupReleases(
        releaseGroupId,
        cacheKey,
        ttl,
        options,
    );
    return mapReleaseGroupReleasesList(releases);
};

export const getArtistKnownReleaseIds = async (
    artistId: string,
    _ttl: number | undefined,
): Promise<string[]> => {
    const cachedArtistReleases = await getCachedArtistReleaseGroups(artistId);

    if (cachedArtistReleases) {
        return getArtistReleaseIds(cachedArtistReleases);
    }

    return await fetchAllReleaseIdsForArtist(artistId);
};

const getCachedArtistReleaseGroups = async (
    artistId: string,
): Promise<CachedArtistReleases | null> =>
    await getCachedData<CachedArtistReleases>(getCacheKey(artistId, 'artistReleases'));

const getArtistReleaseIds = (artistReleases: CachedArtistReleases): string[] =>
    Array.from(new Set(artistReleases.flatMap((group) => group.releaseIds)));

const canUseCachedReleaseGroupReleases = (releases: CachedReleaseGroupReleases): boolean => {
    if (releases.length <= 1) {
        return true;
    }

    return releases.some((release) =>
        release.media.some((media) => (media.tracks?.length ?? 0) > 0),
    );
};

const fetchAndCacheReleaseGroupReleases = async (
    releaseGroupId: string,
    cacheKey: string,
    ttl: number | undefined,
    options?: GetReleaseGroupReleasesOptions,
): Promise<Release[]> => {
    const allReleases = await fetchAllReleasesForReleaseGroup(releaseGroupId);
    const { releases, prunedReleaseIds } = dedupeAndSortReleaseGroupReleases(
        releaseGroupId,
        allReleases,
    );

    const cachedReleases = createCachedReleaseGroupReleases(releases, null);
    await replaceCachedData(cacheKey, cachedReleases, ttl);
    await pruneDuplicateReleaseIdsFromCaches(
        releaseGroupId,
        prunedReleaseIds,
        allReleases,
        cachedReleases,
        ttl,
    );
    await options?.onReleaseIdsPage?.(
        releaseGroupId,
        cachedReleases.map((release) => release.id),
        true,
    );

    return cachedReleases;
};

const normalizeCachedReleaseGroupReleases = async (
    releaseGroupId: string,
    cacheKey: string,
    cached: CachedReleaseGroupReleases,
    ttl: number | undefined,
): Promise<CachedReleaseGroupReleases> => {
    const { releases, prunedReleaseIds } = dedupeAndSortReleaseGroupReleases(
        releaseGroupId,
        cached,
    );

    if (prunedReleaseIds.length === 0) {
        return cached;
    }

    const cachedReleases = createCachedReleaseGroupReleases(releases, cached);
    await replaceCachedData(cacheKey, cachedReleases, ttl);
    await pruneDuplicateReleaseIdsFromCaches(
        releaseGroupId,
        prunedReleaseIds,
        cached,
        cachedReleases,
        ttl,
    );

    return cachedReleases;
};

const pruneDuplicateReleaseIdsFromCaches = async (
    releaseGroupId: string,
    prunedReleaseIds: string[],
    releases: Release[],
    dedupedReleases: Release[],
    ttl: number | undefined,
): Promise<void> => {
    if (prunedReleaseIds.length === 0) {
        return;
    }

    await Promise.all([
        pruneArtistReleaseGroupCaches(
            releaseGroupId,
            prunedReleaseIds,
            releases,
            dedupedReleases,
            ttl,
        ),
        pruneReleaseGroupReleaseCoverCache(releaseGroupId, prunedReleaseIds, ttl),
    ]);
};

const pruneArtistReleaseGroupCaches = async (
    releaseGroupId: string,
    prunedReleaseIds: string[],
    releases: Release[],
    dedupedReleases: Release[],
    ttl: number | undefined,
): Promise<void> => {
    const artistIds = getReleaseArtistIds(releases);
    const prunedReleaseIdSet = new Set(prunedReleaseIds);

    await mapWithConcurrency(artistIds, 10, async (artistId) => {
        const cacheKey = getCacheKey(artistId, 'artistReleases');
        const cached = await getCachedData<CachedArtistReleases>(cacheKey);

        if (!cached) {
            return;
        }

        let changed = false;
        const nextCache = cached.flatMap((releaseGroup) => {
            if (releaseGroup.id !== releaseGroupId) {
                return [releaseGroup];
            }

            const prunedReleaseIdsForGroup = releaseGroup.releaseIds.filter(
                (releaseId) => !prunedReleaseIdSet.has(releaseId),
            );
            const releaseIds =
                prunedReleaseIdsForGroup.length > 0
                    ? prunedReleaseIdsForGroup
                    : getReleaseIdsForArtist(dedupedReleases, artistId);

            if (
                releaseIds.length !== releaseGroup.releaseIds.length ||
                releaseIds.some((releaseId, index) => releaseId !== releaseGroup.releaseIds[index])
            ) {
                changed = true;
            }

            return releaseIds.length > 0 ? [{ ...releaseGroup, releaseIds }] : [];
        });

        if (changed) {
            await replaceCachedData(cacheKey, nextCache, ttl);
        }
    });
};

const getReleaseIdsForArtist = (releases: Release[], artistId: string): string[] => {
    return releases
        .filter((release) => releaseBelongsToArtist(release, artistId))
        .map((release) => release.id);
};

const releaseBelongsToArtist = (release: Release, artistId: string): boolean => {
    return (
        release.artistId === artistId ||
        (release['artist-credit'] ?? []).some((artist) => artist.id === artistId)
    );
};

const pruneReleaseGroupReleaseCoverCache = async (
    releaseGroupId: string,
    prunedReleaseIds: string[],
    ttl: number | undefined,
): Promise<void> => {
    const cacheKey = getCacheKey(releaseGroupId, 'releaseGroupReleaseCovers');
    const cached = await getCachedData<CachedReleaseGroupReleaseCovers>(cacheKey);

    if (!cached) {
        return;
    }

    let changed = false;
    for (const releaseId of prunedReleaseIds) {
        if (cached[releaseId]) {
            delete cached[releaseId];
            changed = true;
        }
    }

    if (changed) {
        await replaceCachedData(cacheKey, cached, ttl);
    }
};

const getReleaseArtistIds = (releases: Release[]): string[] => {
    const artistIds = new Set<string>();

    for (const release of releases) {
        if (release.artistId) {
            artistIds.add(release.artistId);
        }

        for (const artist of release['artist-credit'] ?? []) {
            if (artist.id) {
                artistIds.add(artist.id);
            }
        }
    }

    return Array.from(artistIds);
};
