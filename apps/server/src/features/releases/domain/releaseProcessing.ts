import {
    Release,
    DEFAULT_RELEASE_NOTIFICATION_SETTINGS,
    ReleaseNotificationSettings,
} from '@pawify/shared';
import { releaseMatchesNotificationSettings } from '../../../utils/helpers/releaseNotificationFilter.js';
import { groupByReleaseGroup } from '../../../utils/helpers/releaseGroupingHelpers.js';

const dedupeReleasesById = (releases: Release[]): Release[] => {
    const releasesById = new Map<string, Release>();

    for (const release of releases) {
        releasesById.set(release.id, release);
    }

    return Array.from(releasesById.values());
};

const getTrackedReleases = (
    releases: Release[],
    settings: ReleaseNotificationSettings,
): Release[] =>
    dedupeReleasesById(releases).filter((release) =>
        releaseMatchesNotificationSettings(release, settings),
    );

const sortReleaseCandidates = (
    releases: Release[],
    knownReleaseIds?: ReadonlySet<string>,
): Release[] =>
    [...releases].sort((left, right) => {
        const leftKnown = knownReleaseIds?.has(left.id) ?? false;
        const rightKnown = knownReleaseIds?.has(right.id) ?? false;

        if (leftKnown !== rightKnown) {
            return leftKnown ? -1 : 1;
        }

        return left.id.localeCompare(right.id);
    });

export const getNotificationCandidateReleases = (
    releases: Release[],
    knownReleaseIds?: ReadonlySet<string>,
    settings: ReleaseNotificationSettings = DEFAULT_RELEASE_NOTIFICATION_SETTINGS,
): Release[] => {
    const trackedReleases = sortReleaseCandidates(
        getTrackedReleases(releases, settings),
        knownReleaseIds,
    );
    const groupedReleases = groupByReleaseGroup(trackedReleases);
    const groupedReleaseIds = new Set<string>();
    const dedupedGroupedReleases = Array.from(groupedReleases.values()).flat();

    for (const release of dedupedGroupedReleases) {
        groupedReleaseIds.add(release.id);
    }

    return [
        ...dedupedGroupedReleases,
        ...trackedReleases.filter(
            (release) => !groupedReleaseIds.has(release.id) && !release.releaseGroupId,
        ),
    ];
};

export const analyzeReleaseChanges = (
    currentReleases: string[],
    allReleasesFlat: Release[],
    settings: ReleaseNotificationSettings = DEFAULT_RELEASE_NOTIFICATION_SETTINGS,
) => {
    const currentReleaseIds = new Set(currentReleases);
    const fetchedReleaseIds = new Set(
        dedupeReleasesById(allReleasesFlat).map((release) => release.id),
    );
    const trackedReleaseIds = new Set(
        getTrackedReleases(allReleasesFlat, settings).map((release) => release.id),
    );
    const notificationCandidateReleases = getNotificationCandidateReleases(
        allReleasesFlat,
        currentReleaseIds,
        settings,
    );
    const notificationCandidateReleaseIds = new Set(
        notificationCandidateReleases.map((release) => release.id),
    );
    const deletedReleaseIds = currentReleases.filter((id) => !fetchedReleaseIds.has(id));
    const duplicateReleaseIds = currentReleases.filter(
        (id) => trackedReleaseIds.has(id) && !notificationCandidateReleaseIds.has(id),
    );
    const filteredOutReleaseIds = currentReleases.filter(
        (id) => fetchedReleaseIds.has(id) && !notificationCandidateReleaseIds.has(id),
    );
    const prunedReleaseIds = [...deletedReleaseIds, ...filteredOutReleaseIds];
    const artistNewReleases = notificationCandidateReleases.filter(
        (release) => !currentReleaseIds.has(release.id),
    );
    const releasesChanged = prunedReleaseIds.length > 0 || artistNewReleases.length > 0;

    return {
        deletedReleaseIds,
        duplicateReleaseIds,
        filteredOutReleaseIds,
        prunedReleaseIds,
        artistNewReleases,
        notificationCandidateReleases,
        releasesChanged,
    };
};
