import type { NewRelease, ReleaseNotificationSettings } from '@pawify/shared';
import { getFollowingFromDb } from '../firebase/followingStore.js';
import {
    getKnownReleaseGroupStateFromDb,
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

        return result;
    } catch (error) {
        throw Object.assign(new Error('Failed to fetch new releases'), { cause: error });
    }
};
