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
import { sendDataOnlyNotification } from '../../../services/notifications/dataNotificationPublisher.js';
import { notificationEvents } from '../../../services/notifications/notificationEvents.js';
import { emptyKnownReleaseGroupState } from '../../releases/domain/releaseGroupProcessing.js';
import {
    getArtistDetailsFromMirror,
    getArtistReleaseGroupIdsFromMirror,
    getFollowedArtistSummaryFromMirror,
    searchArtistsFromMirror,
    searchRecordingsFromMirror,
    searchReleaseGroupsFromMirror,
} from '../../../infrastructure/musicDb/musicDbRepositories.js';
import type { ArtistUseCaseDependencies } from '../ports.js';

const logger = createLogger('features.artists.dependencies');

/**
 * Catalogue dependencies are SQLite-only.
 *
 * A local miss is a local not-found: it is not proof that MusicBrainz globally
 * deleted the entity, so it must not delete user history. A database failure
 * throws and becomes an explicit retriable service error.
 */
export const artistDependencies: Omit<ArtistUseCaseDependencies, 'assetPlanner'> = {
    artistDetailsGateway: {
        getArtistDetails: async (_userId, artistId) => getArtistDetailsFromMirror(artistId),
        getFollowedArtistSummary: async (_userId, artistId) =>
            getFollowedArtistSummaryFromMirror(artistId),
    },
    artistFollowingRepository: {
        getFollowingArtistIds: async (userId) => {
            return await getFollowingFromDb(userId);
        },
        getFollowingState: async (userId) => {
            return await getFollowingStateFromDb(userId);
        },
        saveFollowedArtist: async (userId, artistId, groupIds, artistSummary) => {
            // Seeded with an unbaselined state: the artist's existing catalogue is
            // known and must not notify. The first scan records the content baseline
            // (max Official track count and keywords) without notifying.
            await saveArtistAndKnownReleasesToDb(
                userId,
                artistId,
                new Map(
                    groupIds.map((groupId) => [groupId, emptyKnownReleaseGroupState('', false)]),
                ),
                [],
                artistSummary,
            );
        },
        saveFollowingArtistSummaries: async (userId, artistSummaries) => {
            await saveFollowingArtistSummariesToDb(userId, artistSummaries);
        },
        deleteFollowedArtist: async (userId, artistId) => {
            await deleteArtistFromDb(userId, artistId);
        },
    },
    artistReleaseCatalogGateway: {
        getArtistReleaseGroupIds: async (artistId) => {
            return getArtistReleaseGroupIdsFromMirror(artistId) ?? [];
        },
    },
    artistProfileImageQueue: artistProfileImageTaskQueue,
    artistSearchGateway: {
        searchArtists: async (_userId, query, offset, limit) =>
            searchArtistsFromMirror(query, offset, limit),
        searchRecordings: async (query, offset, limit) =>
            searchRecordingsFromMirror(query, offset, limit),
        searchReleaseGroups: async (_userId, query, offset, limit) =>
            searchReleaseGroupsFromMirror(query, offset, limit),
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
