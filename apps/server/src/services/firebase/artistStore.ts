import type { FollowedArtistSummary } from '../../utils/types/followedArtistTypes.js';
import type { StoredNewRelease } from './types.js';
import { readFollowingArtistsMap, writeFollowingArtistsMap } from './followingStore.js';
import {
    deleteKnownArtistReleasesFromDb,
    getKnownReleasesFromDb,
    replaceKnownArtistReleaseIdsInDb,
} from './knownReleasesStore.js';
import {
    mergeNewReleasesIntoState,
    readNewReleasesState,
    writeNewReleasesState,
} from './newReleasesStore.js';
import { getDocumentRefAndSnapshot } from './userStore.js';

const removeUnfollowedArtistNewReleases = async (
    userId: string,
    artistId: string,
    remainingArtistIds: string[],
): Promise<void> => {
    const newReleasesMap = await readNewReleasesState(userId);
    const knownReleasesByArtist = await getKnownReleasesFromDb(userId);
    const unfollowedArtistReleaseIds = new Set(knownReleasesByArtist[artistId] ?? []);

    if (unfollowedArtistReleaseIds.size === 0) {
        return;
    }

    let changed = false;

    for (const releaseId of Object.keys(newReleasesMap)) {
        if (!unfollowedArtistReleaseIds.has(releaseId)) {
            continue;
        }

        const stillKnownByFollowedArtist = remainingArtistIds.some((remainingArtistId) =>
            (knownReleasesByArtist[remainingArtistId] ?? []).includes(releaseId),
        );
        if (stillKnownByFollowedArtist) {
            continue;
        }

        delete newReleasesMap[releaseId];
        changed = true;
    }

    if (changed) {
        await writeNewReleasesState(userId, newReleasesMap);
    }
};

export const saveArtistAndKnownReleasesToDb = async (
    userId: string,
    artistId: string,
    releaseIds: string[],
    newReleases: StoredNewRelease[],
    artistSummary?: FollowedArtistSummary,
): Promise<void> => {
    if (!artistId || !Array.isArray(releaseIds)) {
        throw new Error('Invalid input: artistId and releases are required.');
    }

    await getDocumentRefAndSnapshot(userId);
    await replaceKnownArtistReleaseIdsInDb(userId, artistId, releaseIds);

    const followingArtistsMap = await readFollowingArtistsMap(userId);
    const existingFollowing = followingArtistsMap[artistId];
    const summaryToSave = artistSummary ?? existingFollowing;

    followingArtistsMap[artistId] = {
        id: artistId,
        name: summaryToSave?.name ?? existingFollowing?.name ?? artistId,
        refreshedAt: summaryToSave?.refreshedAt ?? existingFollowing?.refreshedAt,
        updatedAt: Date.now(),
    };

    await writeFollowingArtistsMap(userId, followingArtistsMap);

    if (newReleases.length === 0) {
        return;
    }

    await mergeNewReleasesIntoState(userId, newReleases);
};

export const deleteArtistFromDb = async (userId: string, artistId: string): Promise<void> => {
    if (!artistId) {
        throw new Error('Invalid input: artistId is required.');
    }

    const followingArtistsMap = await readFollowingArtistsMap(userId);
    const remainingArtistIds = Object.keys(followingArtistsMap).filter(
        (followingArtistId) => followingArtistId !== artistId,
    );

    if (followingArtistsMap[artistId]) {
        delete followingArtistsMap[artistId];
        await writeFollowingArtistsMap(userId, followingArtistsMap);
    }

    await removeUnfollowedArtistNewReleases(userId, artistId, remainingArtistIds);
    await deleteKnownArtistReleasesFromDb(userId, artistId);
};
