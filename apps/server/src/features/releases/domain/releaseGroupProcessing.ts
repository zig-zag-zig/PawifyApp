import {
    DEFAULT_RELEASE_NOTIFICATION_SETTINGS,
    type ReleaseNotificationSettings,
} from '@pawify/shared';

import { releaseDateMatchesNotificationSettings } from '../../../utils/helpers/releaseNotificationFilter.js';
import { dateToTimestamp, sortByDateDescending } from '../../../utils/dateUtil.js';

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
    /**
     * Date of the newest pressing. Notification events are keyed on this: a group
     * that gains a pressing years later is a new event, a pressing from the same
     * release window is not.
     */
    newestReleaseDate: string | null;
};

/**
 * Per-group notification state: the date of the last event the user was notified
 * about. An empty string marks a group migrated from the old release-id state, whose
 * event date is not known yet; it is baselined silently on the next scan.
 */
export type KnownReleaseGroupState = ReadonlyMap<string, string>;

/**
 * How far apart two pressings of the same group can be and still count as one
 * notification event.
 *
 * MusicBrainz files one album as several releases (digital, CD, vinyl, regional
 * pressings, a few weeks apart). Without tracklists there is no exact duplicate test
 * any more, so the release window is the signal. Measured against the full mirror:
 * 253,989 of 640,456 multi-release groups span a week or less and 422,840 span a
 * year or less, so 45 days absorbs the pressing noise while still letting a deluxe
 * or remaster released later notify.
 */
export const RELEASE_EVENT_WINDOW_DAYS = 45;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const eventDateOf = (group: ReleaseGroupCandidate): string | null =>
    group.newestReleaseDate ?? group.date;

const isWithinEventWindow = (left: string | null, right: string | null): boolean => {
    if (!left || !right) {
        // Without dates there is no way to tell events apart, so stay silent rather
        // than guess: a notification for an undated group is never wrong to skip.
        return true;
    }

    return (
        Math.abs(dateToTimestamp(right) - dateToTimestamp(left)) <=
        RELEASE_EVENT_WINDOW_DAYS * MS_PER_DAY
    );
};

export type ReleaseGroupChangeSet = {
    /** Known groups that are no longer in the catalog. */
    deletedGroupIds: string[];
    /** Known groups whose date no longer passes the user's notification settings. */
    filteredOutGroupIds: string[];
    /** Both of the above: what has to leave the user's known set and feed. */
    prunedGroupIds: string[];
    /** Groups that produced a new notification event. */
    newEvents: ReleaseGroupCandidate[];
    /**
     * Groups already known from the pre-migration release-id state. They are
     * recorded with their current event date but must not notify: the user has seen
     * them, the date was simply never stored.
     */
    baselinedGroupIds: string[];
    /** The known set after this scan. */
    groupState: Map<string, string>;
    groupsChanged: boolean;
};

const passesSettings = (
    group: ReleaseGroupCandidate,
    settings: ReleaseNotificationSettings,
    now: Date,
): boolean =>
    // The *event* date, not the group's first release date: the pre-migration code
    // filtered per release, so a 2026 pressing of a 2024 album passed a 12-month
    // window. Filtering on the group date would silently drop every reissue.
    releaseDateMatchesNotificationSettings(eventDateOf(group), settings, now);

/**
 * Differences the user's known release groups against an artist's current catalog.
 *
 * One notification per release-group event, not per release id and not once per
 * group forever: a group can legitimately gain a deluxe edition or a remaster years
 * later, and the user should hear about it. Suppressed pressings never move the
 * event date forward, so a stream of reissues cannot silence a real future release.
 *
 * Pure and source-agnostic: the catalog comes from the local mirror or the
 * MusicBrainz API depending on how the scan is wired, and this does not care.
 */
export const analyzeReleaseGroupChanges = (
    knownState: KnownReleaseGroupState,
    catalog: readonly ReleaseGroupCandidate[],
    settings: ReleaseNotificationSettings = DEFAULT_RELEASE_NOTIFICATION_SETTINGS,
    now = new Date(),
): ReleaseGroupChangeSet => {
    const catalogById = new Map(catalog.map((group) => [group.id, group]));

    // An empty catalog is treated as "no data", never as "everything was deleted".
    // A mirror that has an artist but no releases for it (mid-sync, a dropped table,
    // a partial dump) would otherwise prune the user's entire history for that
    // artist -- and the next complete scan would notify them about all of it again.
    // Staying put costs a stale entry; pruning costs a burst of notifications.
    if (catalog.length === 0 && knownState.size > 0) {
        return {
            deletedGroupIds: [],
            filteredOutGroupIds: [],
            prunedGroupIds: [],
            newEvents: [],
            baselinedGroupIds: [],
            groupState: new Map(knownState),
            groupsChanged: false,
        };
    }

    const groupState = new Map<string, string>();
    const newEvents: ReleaseGroupCandidate[] = [];
    const baselinedGroupIds: string[] = [];

    for (const group of catalog) {
        const eventDate = eventDateOf(group);
        const knownEventDate = knownState.get(group.id);

        if (knownEventDate === undefined) {
            if (passesSettings(group, settings, now)) {
                newEvents.push(group);
                groupState.set(group.id, eventDate ?? '');
            }
            continue;
        }

        if (knownEventDate === '') {
            // Migrated from the release-id era: the group is known, the date is not.
            // Record the current event and stay silent.
            baselinedGroupIds.push(group.id);
            groupState.set(group.id, eventDate ?? '');
            continue;
        }

        if (!passesSettings(group, settings, now)) {
            // Left the user's window; pruned below and re-discovered if it comes back.
            continue;
        }

        if (isWithinEventWindow(knownEventDate, eventDate)) {
            // Same event: keep the earlier date so suppressed pressings cannot
            // extend the window and silence a real future release.
            groupState.set(group.id, knownEventDate);
            continue;
        }

        newEvents.push(group);
        groupState.set(group.id, eventDate ?? '');
    }

    const deletedGroupIds = Array.from(knownState.keys()).filter(
        (groupId) => !catalogById.has(groupId),
    );
    const filteredOutGroupIds = Array.from(knownState.keys()).filter((groupId) => {
        const group = catalogById.get(groupId);
        return (
            group !== undefined &&
            !groupState.has(groupId) &&
            !passesSettings(group, settings, now)
        );
    });

    newEvents.sort(sortByDateDescending);

    return {
        deletedGroupIds,
        filteredOutGroupIds,
        prunedGroupIds: [...deletedGroupIds, ...filteredOutGroupIds],
        newEvents,
        baselinedGroupIds,
        groupState,
        groupsChanged:
            deletedGroupIds.length > 0 ||
            filteredOutGroupIds.length > 0 ||
            newEvents.length > 0 ||
            baselinedGroupIds.length > 0,
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
/**
 * Rewrites stored state keys from release ids to release-group ids.
 *
 * A translated entry deliberately loses its date: a release id was never an event
 * anchor, so the group is known but its event date is unknown and gets baselined
 * silently on the next scan.
 */
export const translateKnownStateToGroupIds = (
    knownState: ReadonlyMap<string, string>,
    releaseToGroupId: ReadonlyMap<string, string>,
): Map<string, string> => {
    const translated = new Map<string, string>();

    for (const [knownId, eventDate] of knownState) {
        const groupId = releaseToGroupId.get(knownId);
        translated.set(groupId ?? knownId, groupId === undefined ? eventDate : '');
    }

    return translated;
};

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
    /** The user's known groups after the release-id to release-group-id migration. */
    knownGroupIds: string[];
    newEvents: ReleaseGroupCandidate[];
    /** The known set after this scan, mapped to its last notified event date. */
    groupState: Map<string, string>;
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
 *
 * `knownIds` may still contain release ids from before the migration; they are
 * translated here, and a translated id carries no event date, so it is baselined
 * instead of notified.
 */
export const planArtistScan = (
    storedState: ReadonlyMap<string, string>,
    catalog: readonly ReleaseGroupCandidate[],
    settings: ReleaseNotificationSettings = DEFAULT_RELEASE_NOTIFICATION_SETTINGS,
    now = new Date(),
): ArtistScanPlan => {
    const knownState = translateKnownStateToGroupIds(
        storedState,
        buildReleaseToGroupMap(catalog),
    );
    const knownGroupIds = Array.from(knownState.keys());
    const changes = analyzeReleaseGroupChanges(knownState, catalog, settings, now);

    return {
        knownGroupIds,
        newEvents: changes.newEvents,
        groupState: changes.groupState,
        prunedGroupIds: changes.prunedGroupIds,
        groupsChanged: changes.groupsChanged,
    };
};
