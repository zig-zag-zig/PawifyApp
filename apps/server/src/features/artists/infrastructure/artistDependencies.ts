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
import { sendDataOnlyNotification } from '../../../services/notifications/dataNotificationPublisher.js';
import { notificationEvents } from '../../../services/notifications/notificationEvents.js';
import { searchForArtist } from '../../../services/musicbrainz/artistSearch.js';
import { searchReleaseGroups } from '../../../services/musicbrainz/releaseGroupSearch.js';
import {
    getArtistDetailsFromMirror,
    getArtistReleaseGroupIdsFromMirror,
    getFollowedArtistSummaryFromMirror,
    searchArtistsFromMirror,
    searchReleaseGroupsFromMirror,
} from '../../../infrastructure/musicDb/musicDbRepositories.js';
import { withMusicDb } from '../../../infrastructure/musicDb/withMusicDb.js';
import { getArtistReleaseGroupCatalog } from '../../../services/musicbrainz/artistReleaseGroupCatalog.js';
import type { ArtistUseCaseDependencies } from '../ports.js';

const logger = createLogger('features.artists.dependencies');

export const artistDependencies: Omit<ArtistUseCaseDependencies, 'assetPlanner'> = {
    artistDetailsGateway: {
        getArtistDetails: async (userId, artistId) => {
            // The mirror answers from local data; a miss (or a mirror failure)
            // transparently uses the API, including its Redis cache.
            const artist = await withMusicDb(
                'getArtistDetails',
                () => getArtistDetailsFromMirror(artistId),
                () => getArtistDetailsFromService(userId, artistId),
            );

            if (artist === null) {
                await deleteArtistFromDb(userId, artistId);
            }

            return artist;
        },
        getFollowedArtistSummary: async (userId, artistId) => {
            const summary = await withMusicDb(
                'getFollowedArtistSummary',
                () => getFollowedArtistSummaryFromMirror(artistId),
                () => getFollowedArtistSummaryFromService(userId, artistId),
            );

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
        saveFollowedArtist: async (userId, artistId, groupIds, artistSummary) => {
            // Seeded with an empty event date: the artist's existing catalogue is
            // known and must not notify. The first scan records the real dates
            // without notifying (the baseline path).
            await saveArtistAndKnownReleasesToDb(
                userId,
                artistId,
                new Map(groupIds.map((groupId) => [groupId, ''])),
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
        getArtistReleaseGroupIds: async (artistId, ttl) =>
            (await withMusicDb(
                'getArtistReleaseGroupIds',
                () => getArtistReleaseGroupIdsFromMirror(artistId),
                async () =>
                    (await getArtistReleaseGroupCatalog(artistId)).groups.map(
                        (group) => group.id,
                    ),
            )) ?? [],
    },
    artistProfileImageQueue: artistProfileImageTaskQueue,
    artistSearchGateway: {
        searchArtists: async (userId, query, offset, limit) =>
            (await withMusicDb(
                'searchArtists',
                () => searchArtistsFromMirror(query, offset, limit),
                async () => await searchForArtist(userId, query, offset, limit),
            )) ?? { artists: [], count: 0 },
        searchReleaseGroups: async (userId, query, offset, limit) =>
            (await withMusicDb(
                'searchReleaseGroups',
                () => searchReleaseGroupsFromMirror(query, offset, limit),
                async () => await searchReleaseGroups(userId, query, offset, limit),
            )) ?? { releaseGroups: [], count: 0 },
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
