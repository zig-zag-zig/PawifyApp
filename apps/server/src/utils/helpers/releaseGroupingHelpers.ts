import { ArtistReleaseGroup, Release } from '../../modules/models/models.js';
import { dateToTimestamp, sortReleasesByDate } from '../../modules/utils/dateUtil.js';

export type DedupeReleaseGroupReleasesResult = {
    releases: Release[];
    prunedReleaseIds: string[];
};

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

        const existingReleasesForGroup = releaseGroups.get(id)!;
        const isDuplicate = existingReleasesForGroup.some((existingRelease) =>
            isDuplicateRelease(existingRelease, release),
        );

        if (!isDuplicate) {
            existingReleasesForGroup.push(release);
        }
    }

    return releaseGroups;
};

export const dedupeReleaseGroupReleases = (
    releaseGroupId: string,
    releases: Release[],
): DedupeReleaseGroupReleasesResult => {
    const releaseGroupsMap = groupByReleaseGroup(releases);
    const dedupedReleases =
        releaseGroupsMap.get(releaseGroupId) ?? Array.from(releaseGroupsMap.values())[0] ?? [];
    const dedupedReleaseIds = new Set(dedupedReleases.map((release) => release.id));
    const prunedReleaseIds = Array.from(
        new Set(
            releases
                .filter((release) => !dedupedReleaseIds.has(release.id))
                .map((release) => release.id),
        ),
    );

    return {
        releases: dedupedReleases,
        prunedReleaseIds,
    };
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

const isDuplicateRelease = (release1: Release, release2: Release): boolean => {
    const name1 = normalizeReleaseComparableText(release1.title);
    const name2 = normalizeReleaseComparableText(release2.title);

    if (name1 !== name2) {
        return false;
    }

    const tracks1 = getAllTrackTitlesOfRelease(release1);
    const tracks2 = getAllTrackTitlesOfRelease(release2);

    if (tracks1.length === 0 || tracks2.length === 0) {
        return false;
    }

    return (
        tracks1.length === tracks2.length &&
        tracks1.every((track, index) => track === tracks2[index])
    );
};

const getAllTrackTitlesOfRelease = (release: Release): string[] => {
    return release.media.flatMap(
        (media) => media.tracks?.map((track) => normalizeReleaseComparableText(track.title)) ?? [],
    );
};

const normalizeReleaseComparableText = (value: string): string => value.trim().toLowerCase();
