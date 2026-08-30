import { ArtistReleaseGroup, Release } from '@pawify/shared';
import { dateToTimestamp, sortReleasesByDate } from '@pawify/shared';
import type { CachedArtistReleases, CachedReleaseGroupReleases } from '../types/cacheTypes.js';

export const createCachedArtistReleaseGroups = (
    releaseGroups: ArtistReleaseGroup[],
    cached: CachedArtistReleases | null,
): CachedArtistReleases => {
    return [...releaseGroups]
        .sort((left, right) => dateToTimestamp(right.date) - dateToTimestamp(left.date))
        .map((releaseGroup) => {
            const cachedGroup = cached?.find((group) => group.id === releaseGroup.id);
            const mergedReleaseGroup = {
                ...releaseGroup,
                date: releaseGroup.date ?? cachedGroup?.date ?? null,
            };

            return mergedReleaseGroup;
        });
};

export const createCachedReleaseGroupReleases = (
    releases: Release[],
    cached: CachedReleaseGroupReleases | null,
): CachedReleaseGroupReleases => {
    const sortedReleases = [...releases];
    sortReleasesByDate(sortedReleases);

    return sortedReleases.map((release) => {
        const cachedRelease = cached?.find((existing) => existing.id === release.id);
        const mergedReleaseGroup = release['release-group']
            ? {
                  ...release['release-group'],
                  date:
                      release['release-group'].date ??
                      cachedRelease?.['release-group']?.date ??
                      null,
              }
            : null;
        return {
            ...release,
            'release-group': mergedReleaseGroup,
            externalLinks:
                (release.externalLinks?.length ?? 0) > 0
                    ? release.externalLinks
                    : (cachedRelease?.externalLinks ?? []),
        };
    });
};
