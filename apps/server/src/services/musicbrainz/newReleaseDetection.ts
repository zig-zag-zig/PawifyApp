import type {
    NewRelease,
    Release,
    ReleaseNotificationSettings,
} from '../../modules/models/models.js';
import { getFollowingFromDb } from '../firebase/followingStore.js';
import {
    getKnownReleasesFromDb,
    mergeKnownArtistReleaseIdsInDb,
} from '../firebase/knownReleasesStore.js';
import { getReleaseNotificationSettingsFromDb } from '../firebase/userSettingsStore.js';
import { processArtistReleases } from '../../utils/helpers/newReleaseHelpers.js';
import { mapWithConcurrency } from '../../utils/helpers/promisePool.js';
import { fetchAllReleasesForArtist } from './releaseQueries.js';

type ArtistProcessResult = {
    deletedReleaseIds: string[];
    newReleases: NewRelease[];
};

const getArtistReleasesForProcessing = async (artistId: string): Promise<Release[]> => {
    return await fetchAllReleasesForArtist(artistId, true);
};

const processSingleArtist = async (
    userId: string,
    artistId: string,
    currentReleasesByArtist: { [artistId: string]: string[] },
    releaseNotificationSettings: ReleaseNotificationSettings,
): Promise<ArtistProcessResult> => {
    return await processArtistReleases(
        userId,
        artistId,
        getArtistReleasesForProcessing,
        currentReleasesByArtist,
        releaseNotificationSettings,
    );
};

const mergeKnownReleasesForFollowedReleaseArtists = async (
    userId: string,
    followedArtistIds: string[],
    newReleases: NewRelease[],
): Promise<void> => {
    const followedArtistIdSet = new Set(followedArtistIds);
    const releaseIdsByFollowedArtist = new Map<string, Set<string>>();

    for (const release of newReleases) {
        for (const artistId of Object.keys(release.artists)) {
            if (!followedArtistIdSet.has(artistId)) {
                continue;
            }

            const releaseIds = releaseIdsByFollowedArtist.get(artistId) ?? new Set<string>();
            releaseIds.add(release.id);
            releaseIdsByFollowedArtist.set(artistId, releaseIds);
        }
    }

    await mapWithConcurrency(
        Array.from(releaseIdsByFollowedArtist.entries()),
        4,
        async ([artistId, releaseIds]) => {
            await mergeKnownArtistReleaseIdsInDb(userId, artistId, Array.from(releaseIds));
        },
    );
};

export const getNewReleases = async (userId: string): Promise<NewRelease[]> => {
    try {
        const followingArtists = await getFollowingFromDb(userId);
        const releaseNotificationSettings = await getReleaseNotificationSettingsFromDb(userId);
        const currentReleasesByArtist = await getKnownReleasesFromDb(userId);
        for (const artistId of followingArtists) {
            currentReleasesByArtist[artistId] ??= [];
        }
        const result: NewRelease[] = [];

        const artistResults = await mapWithConcurrency(
            followingArtists,
            4,
            async (artistId) =>
                await processSingleArtist(
                    userId,
                    artistId,
                    currentReleasesByArtist,
                    releaseNotificationSettings,
                ),
        );

        for (const { newReleases } of artistResults) {
            if (newReleases.length > 0) {
                result.push(...newReleases);
            }
        }

        if (result.length > 0) {
            await mergeKnownReleasesForFollowedReleaseArtists(userId, followingArtists, result);
        }

        return result;
    } catch (error) {
        throw Object.assign(new Error('Failed to fetch new releases'), { cause: error });
    }
};
