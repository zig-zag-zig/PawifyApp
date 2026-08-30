import { getKnownArtistReleaseIdsFromDb, getKnownReleasesFromDb } from './knownReleasesStore.js';
import { getNewReleasesSnapshotFromDb, removeNewReleasesFromDb } from './newReleasesStore.js';

export const getCurrentReleases = async (userId: string, artistId: string): Promise<string[]> => {
    return await getKnownArtistReleaseIdsFromDb(userId, artistId);
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
