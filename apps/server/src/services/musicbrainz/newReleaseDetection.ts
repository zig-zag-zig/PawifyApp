import type { NewRelease, ReleaseNotificationSettings } from '@pawify/shared';
import { getFollowingFromDb } from '../firebase/followingStore.js';
import { getKnownReleaseGroupStateWithStatusFromDb } from '../firebase/knownReleasesStore.js';
import type { KnownReleaseGroupStateValue } from '../../features/releases/domain/releaseGroupProcessing.js';
import { getReleaseNotificationSettingsFromDb } from '../firebase/userSettingsStore.js';
import { processArtistReleases } from '../../utils/helpers/newReleaseHelpers.js';
import { createLogger } from '../../common/logging/logger.js';
import { mapWithConcurrency } from '../../utils/helpers/promisePool.js';
import {
    getArtistReleaseGroupCatalog,
    type ArtistReleaseGroupCatalog,
} from './artistReleaseGroupCatalog.js';

const logger = createLogger('services.musicbrainz.newReleaseDetection');

type ArtistProcessResult = {
    newReleases: NewRelease[];
};

const getCatalogForProcessing = async (artistId: string): Promise<ArtistReleaseGroupCatalog> =>
    await getArtistReleaseGroupCatalog(artistId);

const processSingleArtist = async (
    userId: string,
    artistId: string,
    currentReleaseGroupStateByArtist: {
        [artistId: string]: { [groupId: string]: KnownReleaseGroupStateValue };
    },
    releaseNotificationSettings: ReleaseNotificationSettings,
    knownStateUnmigratedArtistIds: ReadonlySet<string>,
): Promise<ArtistProcessResult> => {
    return await processArtistReleases(
        userId,
        artistId,
        getCatalogForProcessing,
        currentReleaseGroupStateByArtist,
        releaseNotificationSettings,
        knownStateUnmigratedArtistIds.has(artistId),
    );
};

export const getNewReleases = async (userId: string): Promise<NewRelease[]> => {
    try {
        const followingArtists = await getFollowingFromDb(userId);
        const releaseNotificationSettings = await getReleaseNotificationSettingsFromDb(userId);
        const {
            state: currentReleaseGroupStateByArtist,
            unmigratedArtistIds: unmigratedArtistIdsArray,
        } = await getKnownReleaseGroupStateWithStatusFromDb(userId);
        for (const artistId of followingArtists) {
            currentReleaseGroupStateByArtist[artistId] ??= {};
        }
        const unmigratedArtistIds = new Set(unmigratedArtistIdsArray);
        if (unmigratedArtistIds.size > 0) {
            logger.warn(
                'known-release state is not canonical; skipping notification detection for affected artists. See the v3 rollout runbook.',
                {
                    userId,
                    artistCount: unmigratedArtistIds.size,
                    artistIds: unmigratedArtistIdsArray.slice(0, 10),
                },
            );
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
                    unmigratedArtistIds,
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
