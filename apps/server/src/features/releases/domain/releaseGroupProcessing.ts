import {
    DEFAULT_RELEASE_NOTIFICATION_SETTINGS,
    type ReleaseNotificationSettings,
} from '@pawify/shared';

import { releaseDateMatchesNotificationSettings } from '../../../utils/helpers/releaseNotificationFilter.js';
import { sortByDateDescending } from '../../../utils/dateUtil.js';

/**
 * A release group as new-release detection sees it.
 *
 * Detection works at group level, not release level: one album exists as several
 * MusicBrainz releases (digital, CD, vinyl, regional pressings) and each used to
 * count as its own new release, which is what made notifications repeat. The group
 * is the identity; `releaseIds` only matters for drilling into a single pressing.
 */
export type ReleaseGroupCandidate = {
    id: string;
    title: string;
    date: string | null;
    disambiguation: string | null;
    primaryType: string | null;
    releaseIds: string[];
    /**
     * The release used to represent the group to the client (newest pressing).
     * A group can hold several releases, but a screen, a cover and a notification
     * tap all need exactly one.
     */
    newestReleaseId: string;
};

export type ReleaseGroupChangeSet = {
    /** Known groups that are no longer in the catalog. */
    deletedGroupIds: string[];
    /** Known groups whose date no longer passes the user's notification settings. */
    filteredOutGroupIds: string[];
    /** Both of the above: what has to leave the user's known set and feed. */
    prunedGroupIds: string[];
    /** Groups that pass the settings and are not known yet. */
    newGroups: ReleaseGroupCandidate[];
    groupsChanged: boolean;
};

const passesSettings = (
    group: ReleaseGroupCandidate,
    settings: ReleaseNotificationSettings,
    now: Date,
): boolean => releaseDateMatchesNotificationSettings(group.date, settings, now);

/**
 * Differences the user's known release groups against an artist's current catalog.
 *
 * Pure and source-agnostic: the catalog comes from the local mirror or the
 * MusicBrainz API depending on how the scan is wired, and this does not care.
 */
export const analyzeReleaseGroupChanges = (
    knownGroupIds: readonly string[],
    catalog: readonly ReleaseGroupCandidate[],
    settings: ReleaseNotificationSettings = DEFAULT_RELEASE_NOTIFICATION_SETTINGS,
    now = new Date(),
): ReleaseGroupChangeSet => {
    const catalogById = new Map(catalog.map((group) => [group.id, group]));
    const known = Array.from(new Set(knownGroupIds));
    const knownSet = new Set(known);

    // An empty catalog is treated as "no data", never as "everything was deleted".
    // A mirror that has an artist but no releases for it (mid-sync, a dropped table,
    // a partial dump) would otherwise prune the user's entire history for that
    // artist -- and the next complete scan would notify them about all of it again.
    // Staying put costs a stale entry; pruning costs a burst of notifications.
    if (catalog.length === 0 && known.length > 0) {
        return {
            deletedGroupIds: [],
            filteredOutGroupIds: [],
            prunedGroupIds: [],
            newGroups: [],
            groupsChanged: false,
        };
    }

    const newGroups = catalog
        .filter((group) => !knownSet.has(group.id) && passesSettings(group, settings, now))
        .sort(sortByDateDescending);

    const newGroupIds = new Set(newGroups.map((group) => group.id));
    const deletedGroupIds = known.filter((groupId) => !catalogById.has(groupId));
    const filteredOutGroupIds = known.filter((groupId) => {
        const group = catalogById.get(groupId);
        return (
            group !== undefined &&
            !newGroupIds.has(groupId) &&
            !passesSettings(group, settings, now)
        );
    });

    return {
        deletedGroupIds,
        filteredOutGroupIds,
        prunedGroupIds: [...deletedGroupIds, ...filteredOutGroupIds],
        newGroups,
        groupsChanged:
            deletedGroupIds.length > 0 || filteredOutGroupIds.length > 0 || newGroups.length > 0,
    };
};

/**
 * Rewrites a user's known ids after the switch from release ids to release-group ids.
 *
 * Idempotent on purpose. An id that is already a release-group id is not a release,
 * so the lookup misses and it is kept as-is; an id that is a release becomes its
 * group. Running it on migrated data changes nothing, so there is no version marker
 * to store and no window where a partially-migrated user gets re-notified: a
 * release of an already-known group maps to that known group and stays silent.
 */
export const translateKnownIdsToGroupIds = (
    knownIds: readonly string[],
    releaseToGroupId: ReadonlyMap<string, string>,
): string[] => {
    const translated = new Set<string>();

    for (const knownId of knownIds) {
        translated.add(releaseToGroupId.get(knownId) ?? knownId);
    }

    return Array.from(translated);
};
export type ArtistScanPlan = {
    /** The user's known ids after the release-id to release-group-id migration. */
    knownGroupIds: string[];
    newGroups: ReleaseGroupCandidate[];
    /** What the known set becomes: migrated, minus pruned, plus discovered. */
    groupIdsToSave: string[];
    prunedGroupIds: string[];
    groupsChanged: boolean;
};

/**
 * Inverts the catalog's group -> releases mapping.
 *
 * This is what makes the state migration work without storing a version anywhere:
 * an id that is a release id becomes its group; an id that is already a group is
 * not a release, so it misses and is kept.
 */
export const buildReleaseToGroupMap = (
    catalog: readonly ReleaseGroupCandidate[],
): Map<string, string> => {
    const map = new Map<string, string>();
    for (const group of catalog) {
        for (const releaseId of group.releaseIds) {
            map.set(releaseId, group.id);
        }
    }
    return map;
};

/**
 * Decides everything one artist scan should change for one user.
 *
 * Kept pure and source-agnostic (mirror or MusicBrainz catalog) so the part that
 * can silently re-notify someone is covered by tests instead of hidden behind
 * Firebase calls. Turning groups into feed entries needs artist credits, which is a
 * lookup rather than a decision, so the caller does that.
 */
export const planArtistScan = (
    knownIds: readonly string[],
    catalog: readonly ReleaseGroupCandidate[],
    settings: ReleaseNotificationSettings = DEFAULT_RELEASE_NOTIFICATION_SETTINGS,
    now = new Date(),
): ArtistScanPlan => {
    const knownGroupIds = translateKnownIdsToGroupIds(knownIds, buildReleaseToGroupMap(catalog));
    const changes = analyzeReleaseGroupChanges(knownGroupIds, catalog, settings, now);
    const pruned = new Set(changes.prunedGroupIds);
    const groupIdsToSave = Array.from(
        new Set([
            ...knownGroupIds.filter((groupId) => !pruned.has(groupId)),
            ...changes.newGroups.map((group) => group.id),
        ]),
    );

    return {
        knownGroupIds,
        newGroups: changes.newGroups,
        groupIdsToSave,
        prunedGroupIds: changes.prunedGroupIds,
        groupsChanged: changes.groupsChanged,
    };
};
