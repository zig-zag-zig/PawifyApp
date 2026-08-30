import { requestDeduper } from '../../../common/request/requestDeduper.js';
import { createLogger } from '../../../common/logging/logger.js';
import { artistProfileImageTaskQueue } from '../../../infrastructure/taskQueues/profileImageTaskQueue.js';
import {
    getFollowingFromDb,
    getFollowingStateFromDb,
    saveFollowingArtistSummariesToDb,
} from '../../../services/firebase/followingStore.js';
import {
    deleteArtistFromDb,
    saveArtistAndKnownReleasesToDb,
} from '../../../services/firebase/artistStore.js';
import {
    getArtistDetails as getArtistDetailsFromService,
    getFollowedArtistSummary as getFollowedArtistSummaryFromService,
} from '../../../services/artistDetailsService.js';
import { getArtistKnownReleaseIds } from '../../../services/musicbrainz/cachedReleaseCatalog.js';
import { sendDataOnlyNotification } from '../../../services/notifications/dataNotificationPublisher.js';
import { notificationEvents } from '../../../services/notifications/notificationEvents.js';
import { searchForArtist } from '../../../services/musicbrainz/artistSearch.js';
import type { ArtistUseCaseDependencies } from '../ports.js';

const logger = createLogger('features.artists.dependencies');

export const artistDependencies: Omit<ArtistUseCaseDependencies, 'assetPlanner'> = {
    artistDetailsGateway: {
        getArtistDetails: async (userId, artistId) => {
            const artist = await getArtistDetailsFromService(userId, artistId);

            if (artist === null) {
                await deleteArtistFromDb(userId, artistId);
            }

            return artist;
        },
        getFollowedArtistSummary: async (userId, artistId) => {
            const summary = await getFollowedArtistSummaryFromService(userId, artistId);

            if (summary === null) {
                await deleteArtistFromDb(userId, artistId);
            }

            return summary;
        },
    },
    artistFollowingRepository: {
        getFollowingArtistIds: async (userId) => {
            return await getFollowingFromDb(userId);
        },
        getFollowingState: async (userId) => {
            return await getFollowingStateFromDb(userId);
        },
        saveFollowedArtist: async (userId, artistId, releaseIds, artistSummary) => {
            await saveArtistAndKnownReleasesToDb(userId, artistId, releaseIds, [], artistSummary);
        },
        saveFollowingArtistSummaries: async (userId, artistSummaries) => {
            await saveFollowingArtistSummariesToDb(userId, artistSummaries);
        },
        deleteFollowedArtist: async (userId, artistId) => {
            await deleteArtistFromDb(userId, artistId);
        },
    },
    artistReleaseCatalogGateway: {
        getArtistReleaseIds: async (artistId, ttl) => await getArtistKnownReleaseIds(artistId, ttl),
    },
    artistProfileImageQueue: artistProfileImageTaskQueue,
    artistSearchGateway: {
        searchArtists: async (userId, query, offset, limit) =>
            await searchForArtist(userId, query, offset, limit),
    },
    followingNotifier: {
        notifyFollowingChanged: async (userId, sourcePushToken) => {
            try {
                await sendDataOnlyNotification(userId, notificationEvents.following, undefined, {
                    excludePushToken: sourcePushToken,
                });
            } catch (error) {
                // Best-effort: the follow/unfollow write already committed; a push
                // notification failure must not fail the request.
                logger.warn('failed to send following-changed notification', { userId, error });
            }
        },
    },
    requestDeduper,
};
