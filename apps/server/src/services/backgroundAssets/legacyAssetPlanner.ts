import type {
    ArtistProfileImageQueuePort,
    BackgroundAssetPlanner,
    ReleaseTaskQueuePort,
} from './plannerTypes.js';

/**
 * v1 legacy planner: never partitions, queues the full item set, and always
 * returns a task id. Workers still short-circuit cache internally, exactly
 * like the pre-v2 behavior.
 */
export const createLegacyAssetPlanner = (deps: {
    artistProfileImageQueue: ArtistProfileImageQueuePort;
    releaseTaskQueue: ReleaseTaskQueuePort;
}): BackgroundAssetPlanner => ({
    planArtistProfileImages: async ({ userId, scope, lookups, ttl }) => ({
        taskId: deps.artistProfileImageQueue.queueArtistProfileImagesWithLookups(
            userId,
            scope,
            lookups,
            ttl,
        ),
        resolved: {},
    }),
    planArtistReleaseGroupCovers: async ({ userId, artistId, pageEntries, ttl }) => ({
        taskId: deps.releaseTaskQueue.queueArtistReleaseGroupCovers(
            userId,
            artistId,
            pageEntries,
            ttl,
        ),
        resolved: {},
    }),
    planReleaseGroupReleaseCovers: async ({ userId, releaseGroupId, pageEntries, ttl }) => ({
        taskId: deps.releaseTaskQueue.queueReleaseGroupReleaseCovers(
            userId,
            releaseGroupId,
            pageEntries,
            ttl,
        ),
        resolved: {},
    }),
    planNewReleaseCovers: async ({ userId, pageEntries }) => ({
        taskId: deps.releaseTaskQueue.queueNewReleaseCovers(userId, pageEntries, undefined),
        resolved: {},
    }),
    planReleaseTrackLyrics: async ({ userId, release, ttl }) => ({
        taskId: deps.releaseTaskQueue.queueReleaseTrackLyrics(userId, release, ttl),
        resolved: {},
    }),
    planReleaseArtistProfileImages: async ({ userId, release, ttl }) => ({
        taskId: deps.releaseTaskQueue.queueReleaseArtistProfileImages(userId, release, ttl),
        resolved: {},
    }),
});
