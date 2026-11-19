import type { ArtistCredit, ReleaseNotificationSettings, NewRelease } from '@pawify/shared';
import { DEFAULT_RELEASE_NOTIFICATION_SETTINGS } from '@pawify/shared';

import { getReleaseCover } from '../../services/coverArtService.js';
import { saveArtistAndKnownReleasesToDb } from '../../services/firebase/artistStore.js';
import type { StoredNewRelease } from '../../services/firebase/types.js';
import {
    planArtistScan,
    type KnownReleaseGroupStateValue,
    type ReleaseGroupCandidate,
    type ReleaseGroupEvent,
} from '../../features/releases/domain/releaseGroupProcessing.js';
import { toStoredNewRelease } from '../../features/releases/domain/newReleaseEntry.js';
import {
    getCurrentReleaseGroupState,
    removePrunedNewReleaseGroups,
} from '../../services/firebase/newReleaseMaintenance.js';
import { getReleaseGroupCreditsFromMirror } from '../../infrastructure/musicDb/musicDbRepositories.js';
import { mapWithConcurrency } from './promisePool.js';
import type { ArtistReleaseGroupCatalog } from '../../services/musicbrainz/artistReleaseGroupCatalog.js';

type ProcessArtistResult = {
    newReleases: NewRelease[];
};

const NEW_RELEASE_COVER_CACHE_CONCURRENCY = 10;

/**
 * Resolves artist credits only for groups that turned out to be new.
 *
 * The catalog already carries the group identity; credits are the one lookup the
 * diff needs before it can build a feed entry.
 */
const resolveCredits = (
    catalog: ArtistReleaseGroupCatalog,
    groups: readonly ReleaseGroupCandidate[],
): Map<string, ArtistCredit[]> => {
    const missing = groups
        .map((group) => group.id)
        .filter((groupId) => !catalog.creditsByGroupId.has(groupId));

    if (missing.length === 0) {
        return catalog.creditsByGroupId;
    }

    // Mirror mode builds credits on demand: only new groups need them, and a scan
    // usually finds none.
    const merged = new Map(catalog.creditsByGroupId);
    for (const [groupId, credits] of getReleaseGroupCreditsFromMirror(missing)) {
        merged.set(groupId, credits);
    }
    return merged;
};

export const processArtistReleases = async (
    userId: string,
    artistId: string,
    getCatalog: (artistId: string) => Promise<ArtistReleaseGroupCatalog>,
    currentReleaseGroupStateByArtist?: {
        [artistId: string]: { [groupId: string]: KnownReleaseGroupStateValue };
    },
    releaseNotificationSettings: ReleaseNotificationSettings = DEFAULT_RELEASE_NOTIFICATION_SETTINGS,
    knownStateUnmigrated = false,
): Promise<ProcessArtistResult> => {
    const catalog = await getCatalog(artistId);

    const storedState =
        currentReleaseGroupStateByArtist?.[artistId] ??
        (await getCurrentReleaseGroupState(userId, artistId));

    // Plan first (pure, tested): this is where the user's release-id history is
    // migrated to release-group ids and where content-based dedupe decides whether
    // a pressing is the same edition or a genuinely new one. Credits are resolved
    // only for whatever turned out to be new.
    const plan = planArtistScan(
        new Map(Object.entries(storedState)),
        catalog.groups,
        releaseNotificationSettings,
        new Date(),
        catalog.complete && !knownStateUnmigrated,
    );
    const eventGroups = plan.newEvents.map((event) => event.group);
    const creditsByGroupId =
        eventGroups.length === 0 ? catalog.creditsByGroupId : resolveCredits(catalog, eventGroups);

    const mappedNewReleases: StoredNewRelease[] = plan.newEvents.map((event) =>
        toStoredNewRelease(event, creditsByGroupId.get(event.group.id) ?? []),
    );

    if (plan.groupsChanged) {
        await handleGroupChanges({
            userId,
            artistId,
            groupState: plan.groupState,
            newEvents: plan.newEvents,
            storedNewReleases: mappedNewReleases,
        });
    }

    await removePrunedNewReleaseGroups(userId, plan.prunedGroupIds);

    return { newReleases: mappedNewReleases };
};

type HandleGroupChangesOptions = {
    userId: string;
    artistId: string;
    groupState: Map<string, KnownReleaseGroupStateValue>;
    newEvents: ReleaseGroupEvent[];
    storedNewReleases: StoredNewRelease[];
};

const handleGroupChanges = async ({
    userId,
    artistId,
    groupState,
    newEvents,
    storedNewReleases,
}: HandleGroupChangesOptions): Promise<void> => {
    await cacheNewReleaseCovers(newEvents);

    await saveArtistAndKnownReleasesToDb(
        userId,
        artistId,
        groupState,
        storedNewReleases,
        undefined,
    );
};

const cacheNewReleaseCovers = async (events: ReleaseGroupEvent[]): Promise<void> => {
    await mapWithConcurrency(events, NEW_RELEASE_COVER_CACHE_CONCURRENCY, async (event) => {
        // Cover the release the event is about, not an unrelated newest pressing.
        await getReleaseCover(
            event.edition?.releaseId ?? event.group.newestReleaseId,
            event.group.id,
            undefined,
        );
    });
};
