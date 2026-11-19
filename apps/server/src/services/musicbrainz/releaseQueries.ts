import { mapToReleaseResult } from '../../infrastructure/musicbrainz/musicbrainzMapper.js';
import {
    deriveReleaseGroupReleaseListMetadata,
    nameWithDisambiguation,
    type Release,
    type ReleaseGroupReleaseListItem,
} from '@pawify/shared';
import { isFutureDate, sortReleasesByDate } from '../../utils/dateUtil.js';
import { fetchMusicBrainz } from '../musicApi/musicBrainzClient.js';
import { groupByReleaseGroup } from '../../utils/helpers/releaseGroupingHelpers.js';

export type ReleasesPageHandler = (
    releasesPage: Release[],
    isLastPage: boolean,
) => Promise<void> | void;

export type ArtistReleasesFetchResult = {
    releases: Release[];
    /** False when a page failed or the declared count was not reached. */
    complete: boolean;
};

const parseMusicBrainzReleaseCount = (
    releasesPage: any,
): { present: boolean; value: number | null; valid: boolean } => {
    if (
        releasesPage === null ||
        typeof releasesPage !== 'object' ||
        !Object.prototype.hasOwnProperty.call(releasesPage, 'release-count')
    ) {
        return { present: false, value: null, valid: true };
    }

    const raw = releasesPage['release-count'];
    if (raw === null || raw === '') {
        return { present: true, value: null, valid: false };
    }

    const value = Number(raw);
    return Number.isFinite(value) && value >= 0
        ? { present: true, value, valid: true }
        : { present: true, value: null, valid: false };
};

const fetchAllReleasesForArtistDetailed = async (
    artistId: string,
    includeRecordings: boolean,
    onReleasesPage?: ReleasesPageHandler,
): Promise<ArtistReleasesFetchResult> => {
    let offset = 0;
    const limit = 100;
    const allReleases: Release[] = [];
    const seenReleaseIds = new Set<string>();
    let expectedCount: number | null = null;
    let hasExpectedCount = false;
    const include = includeRecordings
        ? 'recordings+release-groups+artist-credits'
        : 'media+release-groups+artist-credits';

    while (true) {
        const releasesPage = await fetchMusicBrainz(
            `/release?artist=${artistId}&fmt=json&inc=${include}&offset=${offset}&limit=${limit}`,
        );
        if (
            releasesPage === null ||
            releasesPage === undefined ||
            typeof releasesPage !== 'object' ||
            !Array.isArray(releasesPage.releases)
        ) {
            return { releases: allReleases, complete: false };
        }

        const count = parseMusicBrainzReleaseCount(releasesPage);
        if (!count.valid) {
            // Best-effort browse data, but never authoritative for detection.
            const invalidPage = mapToReleaseResult(releasesPage, artistId, {
                keepMediaWithoutTracks: true,
            }).releases.filter((release) => !isFutureDate(release.date));
            return { releases: [...allReleases, ...invalidPage], complete: false };
        }
        if (count.value !== null) {
            if (hasExpectedCount && expectedCount !== count.value) {
                return { releases: allReleases, complete: false };
            }
            expectedCount = count.value;
            hasExpectedCount = true;
        } else if (hasExpectedCount) {
            return { releases: allReleases, complete: false };
        }

        const releasesData = mapToReleaseResult(releasesPage, artistId, {
            keepMediaWithoutTracks: true,
        });
        const pageIds = releasesData.releases.map((release) => release.id);
        if (
            new Set(pageIds).size !== pageIds.length ||
            pageIds.some((id) => seenReleaseIds.has(id))
        ) {
            return { releases: allReleases, complete: false };
        }
        for (const id of pageIds) {
            seenReleaseIds.add(id);
        }

        const pageReleases = releasesData.releases.filter((release) => !isFutureDate(release.date));
        allReleases.push(...pageReleases);
        const nextOffset = offset + releasesData.releases.length;
        // Defensive pagination guards: an empty page, a missing/non-finite
        // release-count (fall back to "short page means last page"), or reaching
        // the declared count all stop the loop so a malformed upstream response
        // can never cause unbounded requests against the rate-limited API.
        const isLastPage =
            releasesData.releases.length === 0 ||
            (count.value === null
                ? releasesData.releases.length < limit
                : nextOffset >= count.value);
        await onReleasesPage?.(pageReleases, isLastPage);
        offset = nextOffset;

        if (isLastPage) {
            const countMismatch =
                expectedCount !== null && nextOffset !== expectedCount;
            return { releases: allReleases, complete: !countMismatch };
        }
    }
};

export const fetchAllReleasesForArtistWithCompleteness = async (
    artistId: string,
    includeRecordings: boolean,
    onReleasesPage?: ReleasesPageHandler,
): Promise<ArtistReleasesFetchResult> =>
    await fetchAllReleasesForArtistDetailed(artistId, includeRecordings, onReleasesPage);

export const fetchAllReleasesForArtist = async (
    artistId: string,
    includeRecordings: boolean,
    onReleasesPage?: ReleasesPageHandler,
): Promise<Release[]> =>
    (await fetchAllReleasesForArtistDetailed(artistId, includeRecordings, onReleasesPage)).releases;

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
    const raw = releasesPage?.['release-count'];
    if (raw === null || raw === undefined || raw === '') {
        return null;
    }
    const releaseCount = Number(raw);
    return Number.isFinite(releaseCount) && releaseCount >= 0 ? releaseCount : null;
};

/**
 * Shared list shape for the release-group screen.
 *
 * The API returns media metadata only when asked for it (`inc=media`), and the
 * mapping deliberately mirrors the mirror SQL: sum of media track counts, distinct
 * non-empty formats, null track count when there is no media data at all.
 */
export const mapReleaseGroupReleasesList = (releases: Release[]): ReleaseGroupReleaseListItem[] => {
    return releases.map((release) => {
        const { trackCount, formats } = deriveReleaseGroupReleaseListMetadata(release);
        return {
            id: release.id,
            title: nameWithDisambiguation(release.disambiguation, release.title),
            date: release.date ?? null,
            trackCount,
            formats,
            country: release.country ?? null,
            status: release.status ?? null,
        };
    });
};

export const fetchAllReleasesForReleaseGroup = async (
    releaseGroupId: string,
): Promise<Release[]> => {
    let offset = 0;
    const limit = 100;
    const allReleases: Release[] = [];

    while (true) {
        const releasesPage = await fetchMusicBrainz(
            `/release?release-group=${releaseGroupId}&fmt=json&inc=url-rels+media&offset=${offset}&limit=${limit}`,
        );
        const releasesData = mapToReleaseResult(releasesPage, undefined, {
            keepMediaWithoutTracks: true,
        });
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
