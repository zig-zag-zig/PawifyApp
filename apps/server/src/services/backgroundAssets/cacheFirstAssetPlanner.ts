import type { AssetCachePartitioner } from '../cache/partitionCachedAssets.js';
import {
    collectReleaseArtistIds,
    collectTrackLyricsRequests,
} from '../../features/releases/domain/releaseTaskPayloads.js';
import type {
    ArtistProfileImageQueuePort,
    BackgroundAssetPlanner,
    ReleaseTaskQueuePort,
} from './plannerTypes.js';

/**
 * v2 cache-first planner: pre-resolves everything resolvable from cache,
 * queues only the pending subset, and returns a null task id when nothing is
 * pending. All queued work is namespaced with the v2 contract so it never
 * collides with v1 tasks.
 */
export const createCacheFirstAssetPlanner = (deps: {
    artistProfileImageQueue: ArtistProfileImageQueuePort;
    releaseTaskQueue: ReleaseTaskQueuePort;
    cacheAssetPartitioner: AssetCachePartitioner;
}): BackgroundAssetPlanner => ({
    planArtistProfileImages: async ({ userId, scope, lookups, ttl }) => {
        const { resolved, pending } =
            await deps.cacheAssetPartitioner.partitionArtistProfileImages(lookups);
        const taskId =
            pending.length > 0
                ? deps.artistProfileImageQueue.queueArtistProfileImagesWithLookups(
                      userId,
                      scope,
                      pending,
                      ttl,
                      {
                          fullArtistIds: lookups.map((lookup) => lookup.artistId),
                          contractNamespace: 'v2',
                      },
                  )
                : null;
        return { taskId, resolved };
    },
    planArtistReleaseGroupCovers: async ({ userId, artistId, pageEntries, ttl }) => {
        const { resolved, pending } =
            await deps.cacheAssetPartitioner.partitionArtistReleaseGroupCovers(
                artistId,
                pageEntries,
            );
        const taskId =
            pending.length > 0
                ? deps.releaseTaskQueue.queueArtistReleaseGroupCovers(
                      userId,
                      artistId,
                      pending,
                      ttl,
                      {
                          contractNamespace: 'v2',
                      },
                  )
                : null;
        return { taskId, resolved };
    },
    planReleaseGroupReleaseCovers: async ({ userId, releaseGroupId, pageEntries, ttl }) => {
        const { resolved, pending } =
            await deps.cacheAssetPartitioner.partitionReleaseGroupReleaseCovers(pageEntries);
        const taskId =
            pending.length > 0
                ? deps.releaseTaskQueue.queueReleaseGroupReleaseCovers(
                      userId,
                      releaseGroupId,
                      pending,
                      ttl,
                      {
                          contractNamespace: 'v2',
                      },
                  )
                : null;
        return { taskId, resolved };
    },
    planNewReleaseCovers: async ({ userId, pageEntries }) => {
        const { resolved, pending } =
            await deps.cacheAssetPartitioner.partitionReleaseGroupReleaseCovers(pageEntries);
        const taskId =
            pending.length > 0
                ? deps.releaseTaskQueue.queueNewReleaseCovers(userId, pageEntries, undefined, {
                      pendingEntries: pending,
                      contractNamespace: 'v2',
                  })
                : null;
        return { taskId, resolved };
    },
    planReleaseTrackLyrics: async ({ userId, release, ttl }) => {
        const tracks = collectTrackLyricsRequests(release);
        const { resolved, pending } = await deps.cacheAssetPartitioner.partitionTrackLyrics(
            release.id,
            tracks,
        );
        const taskId =
            pending.length > 0
                ? deps.releaseTaskQueue.queueReleaseTrackLyrics(userId, release, ttl, {
                      pendingTracks: pending,
                      contractNamespace: 'v2',
                  })
                : null;
        return { taskId, resolved };
    },
    planReleaseArtistProfileImages: async ({ userId, release, ttl }) => {
        const artistIds = collectReleaseArtistIds(release);
        const lookups = artistIds.map((artistId) => ({ artistId }));
        const { resolved, pending } =
            await deps.cacheAssetPartitioner.partitionArtistProfileImages(lookups);
        const taskId =
            pending.length > 0
                ? deps.releaseTaskQueue.queueReleaseArtistProfileImages(userId, release, ttl, {
                      pendingArtistIds: pending.map((lookup) => lookup.artistId),
                      fullArtistIds: artistIds,
                      contractNamespace: 'v2',
                  })
                : null;
        return { taskId, resolved };
    },
});
