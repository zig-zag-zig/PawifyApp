import type { NewRelease, ReleaseNotificationSettings } from '@pawify/shared';
import { getFollowingFromDb } from '../firebase/followingStore.js';
import {
    getKnownReleaseGroupStateFromDb,
    mergeKnownArtistReleaseIdsInDb,
} from '../firebase/knownReleasesStore.js';
import { getReleaseNotificationSettingsFromDb } from '../firebase/userSettingsStore.js';
import { processArtistReleases } from '../../utils/helpers/newReleaseHelpers.js';
import { mapWithConcurrency } from '../../utils/helpers/promisePool.js';
import {
    getArtistReleaseGroupCatalog,
    type ArtistReleaseGroupCatalog,
} from './artistReleaseGroupCatalog.js';

type ArtistProcessResult = {
    newReleases: NewRelease[];
};

const getCatalogForProcessing = async (artistId: string): Promise<ArtistReleaseGroupCatalog> =>
    await getArtistReleaseGroupCatalog(artistId);

const processSingleArtist = async (
    userId: string,
    artistId: string,
    currentReleaseGroupStateByArtist: { [artistId: string]: { [groupId: string]: string } },
    releaseNotificationSettings: ReleaseNotificationSettings,
): Promise<ArtistProcessResult> => {
    return await processArtistReleases(
        userId,
        artistId,
        getCatalogForProcessing,
        currentReleaseGroupStateByArtist,
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

            // Group id, because a known set is a set of release groups now: a
            // co-credited follow must be silenced for the whole album, not just the
            // one pressing this artist happened to be listed on.
            const groupIds = releaseIdsByFollowedArtist.get(artistId) ?? new Set<string>();
            groupIds.add(release.releaseGroupId ?? release.id);
            releaseIdsByFollowedArtist.set(artistId, groupIds);
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
        const currentReleaseGroupStateByArtist = await getKnownReleaseGroupStateFromDb(userId);
        for (const artistId of followingArtists) {
            currentReleaseGroupStateByArtist[artistId] ??= {};
        }
        const result: NewRelease[] = [];

        const artistResults = await mapWithConcurrency(
            followingArtists,
            4,
            async (artistId) =>
                await processSingleArtist(
                    userId,
                    artistId,
                    currentReleaseGroupStateByArtist,
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
