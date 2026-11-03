import {
    getKnownArtistReleaseGroupStateFromDb,
    getKnownArtistReleaseIdsFromDb,
    getKnownReleasesFromDb,
    getKnownReleaseGroupStateFromDb,
} from './knownReleasesStore.js';
import { getNewReleasesSnapshotFromDb, removeNewReleasesFromDb } from './newReleasesStore.js';

export const getCurrentReleases = async (userId: string, artistId: string): Promise<string[]> => {
    return await getKnownArtistReleaseIdsFromDb(userId, artistId);
};

/** Known release groups with their last notification event date. */
export const getCurrentReleaseGroupState = async (
    userId: string,
    artistId: string,
): Promise<{ [groupId: string]: string }> => {
    return await getKnownArtistReleaseGroupStateFromDb(userId, artistId);
};

export const getAllKnownReleaseGroupStates = async (
    userId: string,
): Promise<{ [artistId: string]: { [groupId: string]: string } }> => {
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

    const prunedGroupIds = new Set(releaseGroupIds);
    const { newReleasesMap } = await getNewReleasesSnapshotFromDb(userId);
    const knownStatesByArtist = await getKnownReleaseGroupStateFromDb(userId);

    const releaseIdsToRemove = Object.entries(newReleasesMap)
        .filter(([, entry]) => {
            const groupId = entry.releaseGroupId;
            // Entries stored before the migration carry no group id; they are keyed
            // by a release id and are handled by the release-id path below.
            return groupId !== null && groupId !== undefined && prunedGroupIds.has(groupId);
        })
        .map(([releaseId]) => releaseId)
        .filter((releaseId) => {
            const groupId = newReleasesMap[releaseId]?.releaseGroupId;
            return !Object.values(knownStatesByArtist).some(
                (state) =>
                    Object.prototype.hasOwnProperty.call(state, releaseId) ||
                    (groupId !== null && groupId !== undefined && Object.prototype.hasOwnProperty.call(state, groupId)),
            );
        });

    if (releaseIdsToRemove.length > 0) {
        await removeNewReleasesFromDb(userId, releaseIdsToRemove);
    }

    return releaseIdsToRemove.length > 0;
};

export const removePrunedNewReleases = async (
    userId: string,
    releaseIds: string[],
): Promise<boolean> => {
    if (releaseIds.length === 0) return false;

    const { newReleasesMap } = await getNewReleasesSnapshotFromDb(userId);
    const knownReleasesByArtist = await getKnownReleasesFromDb(userId);
    const releaseIdsToRemove = releaseIds.filter((releaseId) => {
        if (!newReleasesMap[releaseId]) {
            return false;
        }

        return !Object.values(knownReleasesByArtist).some((knownReleaseIds) =>
            knownReleaseIds.includes(releaseId),
        );
    });

    if (releaseIdsToRemove.length > 0) {
        await removeNewReleasesFromDb(userId, releaseIdsToRemove);
    }

    return releaseIdsToRemove.length > 0;
};
