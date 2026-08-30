import { mapToReleaseResult } from '../../infrastructure/musicbrainz/musicbrainzMapper.js';
import type { Release, ReleaseGroupReleaseListItem } from '../../modules/models/models.js';
import { isFutureDate, sortReleasesByDate } from '../../modules/utils/dateUtil.js';
import { nameWithDisambiguation } from '../../modules/utils/helpers.js';
import { fetchMusicBrainz } from '../musicApi/musicBrainzClient.js';
import {
    dedupeReleaseGroupReleases,
    groupByReleaseGroup,
} from '../../utils/helpers/releaseGroupingHelpers.js';

export type ReleasesPageHandler = (
    releasesPage: Release[],
    isLastPage: boolean,
) => Promise<void> | void;

export const fetchAllReleasesForArtist = async (
    artistId: string,
    includeRecordings: boolean,
    onReleasesPage?: ReleasesPageHandler,
): Promise<Release[]> => {
    let offset = 0;
    const limit = 100;
    const allReleases: Release[] = [];
    const include = includeRecordings
        ? 'recordings+release-groups+artist-credits'
        : 'release-groups+artist-credits';

    while (true) {
        const releasesPage = await fetchMusicBrainz(
            `/release?artist=${artistId}&fmt=json&inc=${include}&offset=${offset}&limit=${limit}`,
        );
        const releasesData = mapToReleaseResult(releasesPage, artistId);
        const pageReleases = releasesData.releases.filter((release) => !isFutureDate(release.date));

        allReleases.push(...pageReleases);
        const nextOffset = offset + releasesData.releases.length;
        const releaseCount = getMusicBrainzReleaseCount(releasesPage);
        // Defensive pagination guards: an empty page, a missing/non-finite
        // release-count (fall back to "short page means last page"), or reaching
        // the declared count all stop the loop so a malformed upstream response
        // can never cause unbounded requests against the rate-limited API.
        const isLastPage =
            releasesData.releases.length === 0 ||
            (releaseCount === null
                ? releasesData.releases.length < limit
                : nextOffset >= releaseCount);
        await onReleasesPage?.(pageReleases, isLastPage);
        offset = nextOffset;

        if (isLastPage) {
            break;
        }
    }

    return allReleases;
};

export const processAndGroupReleases = (allReleases: Release[]): Map<string, Release[]> => {
    const filteredReleases = allReleases.filter((release) => !isFutureDate(release.date));
    const releaseGroupsMap = groupByReleaseGroup(filteredReleases);
    releaseGroupsMap.forEach((releasesInGroup) => sortReleasesByDate(releasesInGroup));
    return releaseGroupsMap;
};

export const fetchAllReleaseIdsForArtist = async (artistId: string): Promise<string[]> => {
    let offset = 0;
    const limit = 100;
    const releaseIds: string[] = [];

    while (true) {
        const releasesPage = await fetchMusicBrainz(
            `/release?artist=${artistId}&fmt=json&inc=release-groups&offset=${offset}&limit=${limit}`,
        );
        const releases = getMusicBrainzReleaseEntries(releasesPage);

        releaseIds.push(...releases.flatMap(getMusicBrainzReleaseId));
        const nextOffset = offset + releases.length;
        const releaseCount = getMusicBrainzReleaseCount(releasesPage);
        offset = nextOffset;

        if (
            releases.length === 0 ||
            (releaseCount === null ? releases.length < limit : nextOffset >= releaseCount)
        ) {
            break;
        }
    }

    return Array.from(new Set(releaseIds));
};

const getMusicBrainzReleaseEntries = (releasesPage: any): any[] =>
    Array.isArray(releasesPage?.releases) ? releasesPage.releases : [];

const getMusicBrainzReleaseId = (release: any): string[] =>
    typeof release?.id === 'string' && release.id.trim() ? [release.id] : [];

const getMusicBrainzReleaseCount = (releasesPage: any): number | null => {
    const releaseCount = Number(releasesPage?.['release-count']);
    return Number.isFinite(releaseCount) && releaseCount >= 0 ? releaseCount : null;
};

export const mapReleaseGroupReleasesList = (releases: Release[]): ReleaseGroupReleaseListItem[] => {
    return releases.map((release) => ({
        id: release.id,
        title: nameWithDisambiguation(release.disambiguation, release.title),
    }));
};

export const fetchAllReleasesForReleaseGroup = async (
    releaseGroupId: string,
): Promise<Release[]> => {
    let offset = 0;
    const limit = 100;
    const allReleases: Release[] = [];

    while (true) {
        const releasesPage = await fetchMusicBrainz(
            `/release?release-group=${releaseGroupId}&fmt=json&inc=recordings+url-rels&offset=${offset}&limit=${limit}`,
        );
        const releasesData = mapToReleaseResult(releasesPage);
        const pageReleases = releasesData.releases
            .filter((release) => !isFutureDate(release.date))
            .map((release) => ensureReleaseGroupLink(release, releaseGroupId));

        allReleases.push(...pageReleases);
        const nextOffset = offset + releasesData.releases.length;
        const releaseCount = getMusicBrainzReleaseCount(releasesPage);
        offset = nextOffset;

        // Same defensive guards as fetchAllReleasesForArtist: stop on an empty
        // page or when release-count is missing/non-finite (short page = last).
        if (
            releasesData.releases.length === 0 ||
            (releaseCount === null
                ? releasesData.releases.length < limit
                : nextOffset >= releaseCount)
        ) {
            break;
        }
    }

    sortReleasesByDate(allReleases);
    return allReleases;
};

export const dedupeAndSortReleaseGroupReleases = (releaseGroupId: string, releases: Release[]) => {
    const result = dedupeReleaseGroupReleases(releaseGroupId, releases);
    sortReleasesByDate(result.releases);
    return result;
};

const ensureReleaseGroupLink = (release: Release, releaseGroupId: string): Release => {
    if (release.releaseGroupId && release['release-group']) {
        return release;
    }

    return {
        ...release,
        releaseGroupId,
        'release-group': release['release-group'] ?? {
            id: releaseGroupId,
            title: '',
            date: null,
            disambiguation: null,
            'primary-type': null,
        },
    };
};
