import type { ArtistCredit, ReleaseNotificationSettings, NewRelease } from '@pawify/shared';
import { DEFAULT_RELEASE_NOTIFICATION_SETTINGS } from '@pawify/shared';

import { deleteCachedData } from '../../services/cacheService.js';
import { getCacheKey } from './cacheHelpers.js';
import { getReleaseCover } from '../../services/coverArtService.js';
import { saveArtistAndKnownReleasesToDb } from '../../services/firebase/artistStore.js';
import type { StoredNewRelease } from '../../services/firebase/types.js';
import {
    planArtistScan,
    type ReleaseGroupCandidate,
} from '../../features/releases/domain/releaseGroupProcessing.js';
import { toStoredNewRelease } from '../../features/releases/domain/newReleaseEntry.js';
import {
    getCurrentReleaseGroupState,
    removePrunedNewReleaseGroups,
} from '../../services/firebase/newReleaseMaintenance.js';
import { getReleaseGroupCreditsFromMirror } from '../../infrastructure/musicDb/musicDbRepositories.js';
import { isMusicDbEnabled } from '../../infrastructure/musicDb/musicDbClient.js';
import { mapWithConcurrency } from './promisePool.js';
import type { ArtistReleaseGroupCatalog } from '../../services/musicbrainz/artistReleaseGroupCatalog.js';

type ProcessArtistResult = {
    newReleases: NewRelease[];
};

const NEW_RELEASE_COVER_CACHE_CONCURRENCY = 10;

/**
 * Inverts the catalog's group -> releases mapping.
 *
 * This is what makes the release-id to release-group-id state migration work
 * without the mirror: the catalog for the artist already says which group each
 * release belongs to. Ids the catalog does not know fall through to the mirror
 * lookup in `getReleaseToGroupIdMapFromMirror` (deleted releases, or releases the
 * artist listing no longer returns), and ids neither knows stay untouched so the
 * diff prunes them.
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
    if (isMusicDbEnabled()) {
        for (const [groupId, credits] of getReleaseGroupCreditsFromMirror(missing)) {
            merged.set(groupId, credits);
        }
    }
    return merged;
};

export const processArtistReleases = async (
    userId: string,
    artistId: string,
    getCatalog: (artistId: string) => Promise<ArtistReleaseGroupCatalog>,
    currentReleaseGroupStateByArtist?: { [artistId: string]: { [groupId: string]: string } },
    releaseNotificationSettings: ReleaseNotificationSettings = DEFAULT_RELEASE_NOTIFICATION_SETTINGS,
): Promise<ProcessArtistResult> => {
    const catalog = await getCatalog(artistId);

    const storedState =
        currentReleaseGroupStateByArtist?.[artistId] ??
        (await getCurrentReleaseGroupState(userId, artistId));

    // Plan first (pure, tested): this is where the user's release-id history is
    // migrated to release-group ids and where the 45-day event window decides
    // whether a pressing is the same event or a genuinely new one. Credits are
    // resolved only for whatever turned out to be new.
    const plan = planArtistScan(
        new Map(Object.entries(storedState)),
        catalog.groups,
        releaseNotificationSettings,
    );
    const creditsByGroupId =
        plan.newEvents.length === 0
            ? catalog.creditsByGroupId
            : resolveCredits(catalog, plan.newEvents);

    const mappedNewReleases: StoredNewRelease[] = plan.newEvents.map((group) =>
        toStoredNewRelease(group, creditsByGroupId.get(group.id) ?? []),
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
    groupState: Map<string, string>;
    newEvents: ReleaseGroupCandidate[];
    storedNewReleases: StoredNewRelease[];
};

const handleGroupChanges = async ({
    userId,
    artistId,
    groupState,
    newEvents,
    storedNewReleases,
}: HandleGroupChangesOptions): Promise<void> => {
    // Everything the feed shows for this artist comes from the catalog, so the
    // cached artist listing is stale as soon as a group is added or removed.
    // Dropping it is cheaper and safer than patching it per release.
    await deleteCachedData(getCacheKey(artistId, 'artistReleases'));

    await cacheNewReleaseCovers(newEvents);

    await saveArtistAndKnownReleasesToDb(
        userId,
        artistId,
        groupState,
        storedNewReleases,
        undefined,
    );
};

const cacheNewReleaseCovers = async (groups: ReleaseGroupCandidate[]): Promise<void> => {
    await mapWithConcurrency(groups, NEW_RELEASE_COVER_CACHE_CONCURRENCY, async (group) => {
        await getReleaseCover(group.newestReleaseId, group.id, undefined);
    });
};
