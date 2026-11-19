import { ArtistReleaseGroup, Release } from '@pawify/shared';
import { dateToTimestamp, sortReleasesByDate } from '../dateUtil.js';

export const groupByReleaseGroup = (releases: Release[]): Map<string, Release[]> => {
    const releaseGroups = new Map<string, Release[]>();

    for (const release of releases) {
        if (!release['release-group']) {
            continue;
        }

        const id = release['release-group'].id;
        if (!releaseGroups.has(id)) {
            releaseGroups.set(id, []);
        }

        releaseGroups.get(id)!.push(release);
    }

    return releaseGroups;
};

export const normalizeReleaseGroups = (releaseGroupsMap: Map<string, Release[]>): void => {
    releaseGroupsMap.forEach((releasesInGroup) => {
        const oldestReleaseDate = getOldestNonNullReleaseDate(releasesInGroup);

        releasesInGroup.forEach((release) => {
            if (!release['release-group']) {
                return;
            }

            if (!release['release-group'].date) {
                release['release-group'].date = oldestReleaseDate;
            }
        });
    });
};

const getOldestNonNullReleaseDate = (releases: Release[]): string | null => {
    let oldestDate: string | null = null;

    for (const release of releases) {
        if (!release.date) {
            continue;
        }

        if (!oldestDate || dateToTimestamp(release.date) < dateToTimestamp(oldestDate)) {
            oldestDate = release.date;
        }
    }

    return oldestDate;
};

export const mapReleaseGroupsToArtistReleases = (
    releaseGroupsMap: Map<string, Release[]>,
): ArtistReleaseGroup[] => {
    return Array.from(releaseGroupsMap.values())
        .map((releases) => {
            const sortedReleases = [...releases];
            sortReleasesByDate(sortedReleases);
            return sortedReleases;
        })
        .filter((releases) => releases.length > 0 && releases[0]['release-group'])
        .map((releases) => ({
            ...releases[0]['release-group']!,
            releaseIds: releases.map((release) => release.id),
        }))
        .sort((left, right) => dateToTimestamp(right.date) - dateToTimestamp(left.date));
};
