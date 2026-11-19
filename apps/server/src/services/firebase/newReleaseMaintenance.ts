import {
    getKnownArtistReleaseGroupStateFromDb,
    getKnownReleaseGroupStateFromDb,
} from './knownReleasesStore.js';
import { getNewReleasesSnapshotFromDb, removeNewReleasesFromDb } from './newReleasesStore.js';
import type { KnownReleaseGroupStateMap } from './knownReleaseStateNormalization.js';
import { collectPrunedNewReleaseIds } from './newReleasePruning.js';

/** Known release groups with their notification and content baseline. */
export const getCurrentReleaseGroupState = async (
    userId: string,
    artistId: string,
) => {
    return await getKnownArtistReleaseGroupStateFromDb(userId, artistId);
};

export const getAllKnownReleaseGroupStates = async (
    userId: string,
): Promise<KnownReleaseGroupStateMap> => {
    return await getKnownReleaseGroupStateFromDb(userId);
};

/**
 * Removes feed entries that belong to pruned release groups.
 *
 * The feed is keyed by release id (that is what the release screen and cover tasks
 * use), while pruning is decided per release group, so the match is on the stored
 * `releaseGroupId`. A second guard keeps an entry that is still known under a
 * different artist, which can happen when several followed artists share a release.
 */
export const removePrunedNewReleaseGroups = async (
    userId: string,
    releaseGroupIds: string[],
): Promise<boolean> => {
    if (releaseGroupIds.length === 0) return false;

    const { newReleasesMap } = await getNewReleasesSnapshotFromDb(userId);
    const knownStatesByArtist = await getKnownReleaseGroupStateFromDb(userId);

    const releaseIdsToRemove = collectPrunedNewReleaseIds({
        newReleasesMap,
        knownStatesByArtist,
        prunedGroupIds: releaseGroupIds,
    });

    if (releaseIdsToRemove.length > 0) {
        await removeNewReleasesFromDb(userId, releaseIdsToRemove);
    }

    return releaseIdsToRemove.length > 0;
};
