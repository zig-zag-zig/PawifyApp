import {
    DEFAULT_RELEASE_NOTIFICATION_SETTINGS,
    type ReleaseNotificationSettings,
} from '@pawify/shared';

import { releaseDateMatchesNotificationSettings } from '../../../utils/helpers/releaseNotificationFilter.js';
import { dateToTimestamp, sortByDateDescending } from '../../../utils/dateUtil.js';
import {
    isOfficialReleaseStatus,
    normalizeEditionKeywords,
} from './releaseEditionKeywords.js';

/**
 * One Official edition of a release group, as new-release detection sees it.
 *
 * Only `Official` editions reach this list. The fields are the content signals the
 * user actually cares about: a deluxe edition with more tracks is an event, while
 * another regional pressing with identical content is not.
 */
export type ReleaseEditionCandidate = {
    releaseId: string;
    date: string | null;
    status: string | null;
    trackCount: number | null;
    formats: string[];
    title: string;
    disambiguation: string | null;
    editionKeywords: string[];
};

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
    /** Date of the newest pressing, retained for display and sorting. */
    newestReleaseDate: string | null;
    /**
     * Official editions only, with the content metadata used to decide whether the
     * group actually gained something new.
     */
    officialEditions: ReleaseEditionCandidate[];
};

/**
 * Per-group notification state.
 *
 * `lastNotifiedDate` is the date of the last group event the user heard about.
 * `maxOfficialTrackCount` and `editionKeywords` are the content baseline: a known
 * group only notifies when it gains more Official tracks or a keyword it never had.
 */
export type KnownReleaseGroupStateValue = {
    lastNotifiedDate: string | null;
    maxOfficialTrackCount: number | null;
    editionKeywords: string[];
    /**
     * Canonical migration marker: the group is known but its content baseline has
     * not been computed yet. The first complete scan baselines it silently; the
     * writer then persists the object without the marker.
     */
    contentBaselined?: boolean;
};

export type KnownReleaseGroupState = ReadonlyMap<string, KnownReleaseGroupStateValue>;

export type ReleaseGroupEventReason = 'new-group' | 'more-tracks' | 'new-edition';

/**
 * One notification event. Multiple qualifying changes in a scan collapse into one
 * event per group; `edition` is the Official edition that caused it, not an
 * unrelated newest pressing.
 */
export type ReleaseGroupEvent = {
    group: ReleaseGroupCandidate;
    reason: ReleaseGroupEventReason;
    edition: ReleaseEditionCandidate | null;
    date: string | null;
    trackCount: number | null;
    editionKeywords: string[];
};

export type ReleaseGroupChangeSet = {
    /** Known groups that are no longer in the catalog. */
    deletedGroupIds: string[];
    /** What has to leave the user's known set and feed. */
    prunedGroupIds: string[];
    /** Groups that produced a new notification event. */
    newEvents: ReleaseGroupEvent[];
    /**
     * Groups already known from the pre-migration state whose content metadata is
     * being recorded for the first time. They must not notify: the user has seen
     * them, only the metadata was missing.
     */
    baselinedGroupIds: string[];
    /** The known set after this scan. */
    groupState: Map<string, KnownReleaseGroupStateValue>;
    groupsChanged: boolean;
};

export const emptyKnownReleaseGroupState = (
    lastNotifiedDate: string | null = null,
    contentBaselined = true,
): KnownReleaseGroupStateValue => ({
    lastNotifiedDate,
    maxOfficialTrackCount: null,
    editionKeywords: [],
    ...(contentBaselined ? {} : { contentBaselined: false }),
});

export const knownReleaseGroupStateValuesEqual = (
    left: KnownReleaseGroupStateValue,
    right: KnownReleaseGroupStateValue,
): boolean =>
    left.lastNotifiedDate === right.lastNotifiedDate &&
    left.maxOfficialTrackCount === right.maxOfficialTrackCount &&
    left.editionKeywords.length === right.editionKeywords.length &&
    left.editionKeywords.every((keyword, index) => keyword === right.editionKeywords[index]) &&
    (left.contentBaselined ?? true) === (right.contentBaselined ?? true);

const startOfDay = (now: Date): number => {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
};

/** Undated editions are not future; only a parsed date after today is excluded. */
const isFutureEdition = (edition: ReleaseEditionCandidate, now: Date): boolean =>
    edition.date !== null && dateToTimestamp(edition.date) > startOfDay(now);

const officialEditionsOf = (
    group: ReleaseGroupCandidate,
    now: Date,
): ReleaseEditionCandidate[] =>
    // The source normally filters before building the candidate, but detection
    // must never let a Bootleg/Promotion edition, or an Official edition that is
    // not out yet, move state or notify. A future deluxe edition must stay out of
    // the baseline so it is still an event on release day.
    group.officialEditions.filter(
        (edition) =>
            isOfficialReleaseStatus(edition.status) && !isFutureEdition(edition, now),
    );

const maxOfficialTrackCount = (editions: readonly ReleaseEditionCandidate[]): number | null => {
    let max: number | null = null;
    for (const edition of editions) {
        const trackCount = edition.trackCount;
        if (
            typeof trackCount === 'number' &&
            Number.isFinite(trackCount) &&
            trackCount >= 0 &&
            (max === null || trackCount > max)
        ) {
            max = trackCount;
        }
    }
    return max;
};

const collectEditionKeywords = (
    editions: readonly ReleaseEditionCandidate[],
): string[] => normalizeEditionKeywords(editions.flatMap((edition) => edition.editionKeywords));

/** Current Official content baseline for a known group, used by state migration. */
export const computeReleaseGroupContentBaseline = (
    group: ReleaseGroupCandidate,
    now = new Date(),
): { maxOfficialTrackCount: number | null; editionKeywords: string[] } => {
    const officialEditions = officialEditionsOf(group, now);
    return {
        maxOfficialTrackCount: maxOfficialTrackCount(officialEditions),
        editionKeywords: collectEditionKeywords(officialEditions),
    };
};

const newerEdition = (
    left: ReleaseEditionCandidate,
    right: ReleaseEditionCandidate,
): ReleaseEditionCandidate => {
    const leftTime = dateToTimestamp(left.date);
    const rightTime = dateToTimestamp(right.date);
    if (leftTime !== rightTime) {
        return leftTime > rightTime ? left : right;
    }
    return left.releaseId <= right.releaseId ? left : right;
};

const newestOfficialEdition = (
    editions: readonly ReleaseEditionCandidate[],
): ReleaseEditionCandidate | null =>
    editions.length > 0 ? editions.reduce(newerEdition) : null;

/**
 * The group's edition-aware event date, used by settings rebuilds.
 *
 * The group's first-release date can be years old while a current Deluxe/Remaster
 * edition is recent. Future editions are excluded so they cannot make a group look
 * current before release day; when there is no released Official edition, the
 * group's own date is the only signal available.
 */
export const releaseGroupEventDate = (
    group: ReleaseGroupCandidate,
    now = new Date(),
): string | null => newestOfficialEdition(officialEditionsOf(group, now))?.date ?? group.date;

type ContentCandidate = {
    edition: ReleaseEditionCandidate;
    reason: ReleaseGroupEventReason;
    keywords: string[];
};

/**
 * Every edition that carries at least one new content signal.
 *
 * Signals are evaluated per edition so eligibility can be applied to the carrier,
 * not to the group-wide maximum. An old 30-track edition must not mask a recent
 * deluxe edition that the user is eligible to hear about.
 */
const contentSignalCandidates = (
    editions: readonly ReleaseEditionCandidate[],
    stored: KnownReleaseGroupStateValue,
): ContentCandidate[] =>
    editions.flatMap((edition) => {
        const hasMoreTracks =
            typeof edition.trackCount === 'number' &&
            (stored.maxOfficialTrackCount === null ||
                edition.trackCount > stored.maxOfficialTrackCount);
        const newKeywords = normalizeEditionKeywords(
            edition.editionKeywords.filter(
                (keyword) => !stored.editionKeywords.includes(keyword),
            ),
        );
        if (!hasMoreTracks && newKeywords.length === 0) {
            return [];
        }

        return [
            {
                edition,
                reason: hasMoreTracks ? 'more-tracks' : 'new-edition',
                keywords: hasMoreTracks ? [] : newKeywords,
            },
        ];
    });

const newerContentCandidate = (
    left: ContentCandidate,
    right: ContentCandidate,
): ContentCandidate => {
    const dateOrder =
        dateToTimestamp(right.edition.date) - dateToTimestamp(left.edition.date);
    if (dateOrder !== 0) {
        return dateOrder > 0 ? right : left;
    }
    if (left.reason !== right.reason) {
        return right.reason === 'more-tracks' ? right : left;
    }
    return right.edition.releaseId < left.edition.releaseId ? right : left;
};

const selectEligibleContentCandidate = (
    candidates: readonly ContentCandidate[],
    settings: ReleaseNotificationSettings,
    now: Date,
): ContentCandidate | null => {
    const eligible = candidates.filter((candidate) =>
        releaseDateMatchesNotificationSettings(candidate.edition.date, settings, now),
    );
    return eligible.length > 0 ? eligible.reduce(newerContentCandidate) : null;
};

const buildEvent = (
    group: ReleaseGroupCandidate,
    reason: ReleaseGroupEventReason,
    edition: ReleaseEditionCandidate | null,
    currentMaxTrackCount: number | null,
    newKeywords: readonly string[],
): ReleaseGroupEvent => ({
    group,
    reason,
    edition,
    date: edition?.date ?? null,
    trackCount: edition?.trackCount ?? currentMaxTrackCount,
    editionKeywords:
        reason === 'new-edition'
            ? normalizeEditionKeywords(newKeywords)
            : normalizeEditionKeywords(edition?.editionKeywords ?? []),
});

const passesEventSettings = (
    event: ReleaseGroupEvent,
    settings: ReleaseNotificationSettings,
    now: Date,
): boolean => releaseDateMatchesNotificationSettings(event.date, settings, now);

/**
 * Differences the user's known release groups against an artist's current catalog.
 *
 * A group notifies once when it first appears and afterwards only when an Official
 * edition adds content: more tracks or a keyword the group never had. Pressings,
 * barcode/country/format changes and repeated scans are not events, and non-Official
 * releases never contribute to the baseline. The user's release-date settings remain
 * an eligibility filter; when an event falls outside them its content baseline is
 * still updated so the same edition is not reconsidered on every scan.
 *
 * Pure and source-agnostic: the catalog comes from the local mirror or the
 * MusicBrainz API depending on how the scan is wired, and this does not care.
 */
export const analyzeReleaseGroupChanges = (
    knownState: KnownReleaseGroupState,
    catalog: readonly ReleaseGroupCandidate[],
    settings: ReleaseNotificationSettings = DEFAULT_RELEASE_NOTIFICATION_SETTINGS,
    now = new Date(),
    complete = true,
): ReleaseGroupChangeSet => {
    const catalogById = new Map(catalog.map((group) => [group.id, group]));

    // A partial catalogue must not prune, baseline or notify: missing groups would
    // look deleted, and a partial set of editions would look like a content change.
    // Callers mark API/mirror results incomplete when pagination failed, a safety
    // bound was hit, or the mirror is not ready.
    if (!complete) {
        return {
            deletedGroupIds: [],
            prunedGroupIds: [],
            newEvents: [],
            baselinedGroupIds: [],
            groupState: new Map(knownState),
            groupsChanged: false,
        };
    }

    // An empty catalog is treated as "no data", never as "everything was deleted".
    // A mirror that has an artist but no releases for it (mid-sync, a dropped table,
    // a partial dump) would otherwise prune the user's entire history for that
    // artist -- and the next complete scan would notify them about all of it again.
    // Staying put costs a stale entry; pruning costs a burst of notifications.
    if (catalog.length === 0 && knownState.size > 0) {
        return {
            deletedGroupIds: [],
            prunedGroupIds: [],
            newEvents: [],
            baselinedGroupIds: [],
            groupState: new Map(knownState),
            groupsChanged: false,
        };
    }

    const groupState = new Map<string, KnownReleaseGroupStateValue>();
    const newEvents: ReleaseGroupEvent[] = [];
    const baselinedGroupIds: string[] = [];
    let groupsChanged = false;

    const setState = (
        groupId: string,
        previous: KnownReleaseGroupStateValue | undefined,
        next: KnownReleaseGroupStateValue,
    ): void => {
        groupState.set(groupId, next);
        if (previous === undefined || !knownReleaseGroupStateValuesEqual(previous, next)) {
            groupsChanged = true;
        }
    };

    for (const group of catalog) {
        const officialEditions = officialEditionsOf(group, now);
        const currentMaxTrackCount = maxOfficialTrackCount(officialEditions);
        const currentKeywords = collectEditionKeywords(officialEditions);
        const stored = knownState.get(group.id);

        if (stored === undefined) {
            // A group with no Official edition is still recorded: it is a known
            // group, it just has nothing to notify about yet.
            const edition = newestOfficialEdition(officialEditions);
            const event =
                edition === null
                    ? null
                    : buildEvent(group, 'new-group', edition, currentMaxTrackCount, []);
            const passed = event !== null && passesEventSettings(event, settings, now);
            setState(group.id, undefined, {
                lastNotifiedDate: passed ? event.date : null,
                maxOfficialTrackCount: currentMaxTrackCount,
                editionKeywords: currentKeywords,
            });
            if (passed) {
                newEvents.push(event);
            }
            continue;
        }

        // The migration marker means the group is known but its content baseline
        // has not been computed. Record the current content without notifying; the
        // writer removes the marker, so this happens exactly once.
        if (stored.contentBaselined === false) {
            baselinedGroupIds.push(group.id);
            setState(group.id, stored, {
                lastNotifiedDate: stored.lastNotifiedDate,
                maxOfficialTrackCount: currentMaxTrackCount,
                editionKeywords: currentKeywords,
            });
            continue;
        }

        const candidates = contentSignalCandidates(officialEditions, stored);
        if (candidates.length === 0) {
            // No content change: keep the stored state byte-for-byte. A pressing
            // with identical content, a barcode/country/format change or a repeated
            // scan must not move the baseline or notify.
            groupState.set(group.id, stored);
            continue;
        }

        // Evaluate both signal types before collapsing to one event: an ineligible
        // track-count carrier must not hide an eligible keyword carrier.
        const selected = selectEligibleContentCandidate(candidates, settings, now);
        const event =
            selected === null
                ? null
                : buildEvent(
                      group,
                      selected.reason,
                      selected.edition,
                      currentMaxTrackCount,
                      selected.keywords,
                  );

        setState(group.id, stored, {
            lastNotifiedDate: event?.date ?? stored.lastNotifiedDate,
            maxOfficialTrackCount:
                currentMaxTrackCount === null
                    ? stored.maxOfficialTrackCount
                    : Math.max(stored.maxOfficialTrackCount ?? 0, currentMaxTrackCount),
            editionKeywords: normalizeEditionKeywords([
                ...stored.editionKeywords,
                ...currentKeywords,
            ]),
        });

        if (event !== null) {
            newEvents.push(event);
        }
    }

    const deletedGroupIds = Array.from(knownState.keys()).filter(
        (groupId) => !catalogById.has(groupId),
    );
    for (const groupId of deletedGroupIds) {
        groupState.delete(groupId);
    }

    newEvents.sort((left, right) => sortByDateDescending(left, right));

    return {
        deletedGroupIds,
        prunedGroupIds: deletedGroupIds,
        newEvents,
        baselinedGroupIds,
        groupState,
        groupsChanged: groupsChanged || deletedGroupIds.length > 0,
    };
};

export type ArtistScanPlan = {
    /** The user's known groups after the release-id to release-group-id migration. */
    knownGroupIds: string[];
    newEvents: ReleaseGroupEvent[];
    /** The known set after this scan, with its content baseline. */
    groupState: Map<string, KnownReleaseGroupStateValue>;
    prunedGroupIds: string[];
    groupsChanged: boolean;
};

/**
 * Decides everything one artist scan should change for one user.
 *
 * Kept pure and source-agnostic (mirror or MusicBrainz catalog) so the part that
 * can silently re-notify someone is covered by tests instead of hidden behind
 * Firebase calls. Turning events into feed entries needs artist credits, which is a
 * lookup rather than a decision, so the caller does that.
 *
 * `storedState` is assumed canonical (group ids) after the one-time migration.
 */
export const planArtistScan = (
    storedState: KnownReleaseGroupState,
    catalog: readonly ReleaseGroupCandidate[],
    settings: ReleaseNotificationSettings = DEFAULT_RELEASE_NOTIFICATION_SETTINGS,
    now = new Date(),
    complete = true,
): ArtistScanPlan => {
    const knownGroupIds = Array.from(storedState.keys());
    const changes = analyzeReleaseGroupChanges(storedState, catalog, settings, now, complete);

    return {
        knownGroupIds,
        newEvents: changes.newEvents,
        groupState: changes.groupState,
        prunedGroupIds: changes.prunedGroupIds,
        groupsChanged: changes.groupsChanged,
    };
};