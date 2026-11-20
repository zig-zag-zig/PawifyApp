import express from 'express';
import { NotFoundError } from '../common/http/errors.js';
import {
    optionalIntegerInRange,
    optionalString,
    requireString,
    requireStringArray,
} from '../common/http/validation.js';
import { authenticatedHandler } from '../infrastructure/http/authenticatedHandler.js';
import { artistProfileImageTaskQueue } from '../infrastructure/taskQueues/profileImageTaskQueue.js';
import { createArtistRoutes } from '../features/artists/artistRoutes.js';
import { createArtistUseCases } from '../features/artists/artistUseCases.js';
import { artistPresentersV3 } from '../features/artists/handlers/artistHandlers.js';
import { sqliteReleaseCatalog } from '../features/releases/infrastructure/sqliteReleaseCatalog.js';
import { releaseTaskQueue } from '../features/releases/infrastructure/releaseTaskQueue.js';
import { collectTrackLyricsRequests } from '../features/releases/domain/releaseTaskPayloads.js';
import {
    createReleaseHandlers,
    releasePresentersV3,
} from '../features/releases/handlers/releaseHandlers.js';
import { createReleaseUseCases } from '../features/releases/releaseUseCases.js';
import { cacheFirstAssetPlanner } from '../services/backgroundAssets/assetPlanner.js';
import { queueTrackLyricsTask } from '../services/backgroundTaskWorkers.js';
import { addTaskUser } from '../services/taskService.js';
import { getReleaseCover } from '../services/coverArtService.js';
import { artistCacheTtlHours } from '../services/cache/ttlPolicy.js';
import type { BackgroundAssetPlanner } from '../services/backgroundAssets/plannerTypes.js';

// V1 displays task results, not immediate artwork maps. Only these adapters
// need the old wire shape; both versions use the same SQLite catalogue/workers.
const v1Planner: BackgroundAssetPlanner = {
    ...cacheFirstAssetPlanner,
    planArtistProfileImages: async ({ userId, scope, lookups, ttl }) => ({
        taskId: artistProfileImageTaskQueue.queueArtistProfileImagesWithLookups(
            userId,
            scope,
            lookups,
            ttl,
            { contractNamespace: 'v1' },
        ),
        resolved: {},
    }),
    planArtistReleaseGroupCovers: async ({ userId, scope, pageEntries, ttl }) => ({
        taskId: releaseTaskQueue.queueArtistReleaseGroupCovers(userId, scope, pageEntries, ttl, {
            contractNamespace: 'v1',
        }),
        resolved: {},
    }),
    planReleaseGroupReleaseCovers: async ({ userId, releaseGroupId, pageEntries, ttl }) => ({
        taskId: releaseTaskQueue.queueReleaseGroupReleaseCovers(
            userId,
            releaseGroupId,
            pageEntries,
            ttl,
            { contractNamespace: 'v1' },
        ),
        resolved: {},
    }),
    planReleaseArtistProfileImages: async ({ userId, release, ttl }) => ({
        taskId: releaseTaskQueue.queueReleaseArtistProfileImages(userId, release, ttl, {
            contractNamespace: 'v1',
        }),
        resolved: {},
    }),
};

export const createCompatibilityRoutes = (version: 'v1' | 'v2'): express.Router => {
    const router = express.Router();
    const v1 = version === 'v1';
    const planner = v1 ? v1Planner : cacheFirstAssetPlanner;
    const useCases = createReleaseUseCases(planner);
    const handlers = createReleaseHandlers(useCases, releasePresentersV3);

    router.use(
        createArtistRoutes(
            createArtistUseCases(planner),
            v1
                ? {
                      ...artistPresentersV3,
                      getFollowing: ({ artists, profileImageTaskId }) => ({
                          artists,
                          profileImageTaskId,
                      }),
                      getArtistDetails: ({ artist, profileImageTaskId }) => ({
                          artist,
                          profileImageTaskId,
                      }),
                      searchArtists: ({ artists, count, profileImageTaskId }) => ({
                          artists,
                          count,
                          profileImageTaskId,
                      }),
                      searchReleaseGroups: ({ releaseGroups, count, releaseGroupCoverTaskId }) => ({
                          releaseGroups,
                          count,
                          releaseGroupCoverTaskId,
                      }),
                  }
                : artistPresentersV3,
        ),
    );

    router.get(
        '/getNewReleases',
        v1
            ? authenticatedHandler('/getNewReleases', async ({ res, userId }) => {
                  const { releases, releaseCoverTaskId } = await useCases.getNewReleases(userId);
                  res.json({ releases, releaseCoverTaskId });
              })
            : handlers.getNewReleasesHandler,
    );
    router.post('/removeNewReleases', handlers.removeNewReleasesHandler);
    router.post('/verifyReleaseExistence', handlers.verifyReleaseExistenceHandler);
    router.post(
        '/resolveNewReleaseCovers',
        v1
            ? authenticatedHandler('/resolveNewReleaseCovers', async ({ req, res }) => {
                  requireStringArray(req.body, 'releaseIds', 100);
                  res.json({});
              })
            : handlers.resolveNewReleaseCoversHandler,
    );

    router.post(
        '/getArtistReleases',
        authenticatedHandler('/getArtistReleases', async ({ req, res, userId }) => {
            const artistId = requireString(req.body, 'artistId');
            if (!v1) {
                const limit = optionalIntegerInRange(req.body, 'limit', 60, 1, 200);
                const cursor = optionalString(req.body, 'cursor') ?? null;
                res.json(await useCases.getArtistReleasesPage(userId, artistId, { limit, cursor }));
                return;
            }
            const releaseGroups = await sqliteReleaseCatalog.getArtistReleases(artistId);
            const plan = await planner.planArtistReleaseGroupCovers({
                userId,
                scope: artistId,
                ttl: artistCacheTtlHours,
                pageEntries: releaseGroups.map(({ id, releaseIds }) => ({
                    releaseGroupId: id,
                    releaseIds,
                })),
            });
            res.json({ releaseGroups, releaseGroupCoverTaskId: plan.taskId });
        }),
    );

    router.post(
        '/getReleaseGroupReleases',
        authenticatedHandler('/getReleaseGroupReleases', async ({ req, res, userId }) => {
            const id = requireString(req.body, 'releaseGroupId');
            const group = await useCases.getReleaseGroupReleases(userId, id);
            res.json({
                releases: group?.releases ?? [],
                releaseCoverTaskId: group?.releaseCoverTaskId ?? null,
                ...(v1 ? {} : { releaseCovers: group?.releaseCovers ?? {} }),
            });
        }),
    );

    router.post(
        '/getRelease',
        authenticatedHandler('/getRelease', async ({ req, res, userId }) => {
            const id = requireString(req.body, 'releaseId');
            const release = await sqliteReleaseCatalog.getRelease(id);
            if (!release) throw new NotFoundError('Release was not found in the local catalogue');

            // The old screens don't know about v3's cover-enrichment task, and
            // expect the original header-only payload with its cover resolved.
            const header = { ...release, media: [] };
            const [images, cover] = await Promise.all([
                planner.planReleaseArtistProfileImages({ userId, release: header, ttl: undefined }),
                getReleaseCover(release.id, release.releaseGroupId, undefined),
            ]);
            res.json({
                release: { ...header, cover_url: cover.state.url ?? null },
                profileImageTaskId: images.taskId,
                ...(v1 ? {} : { profileImages: images.resolved }),
            });
        }),
    );

    router.post(
        '/getReleaseTracks',
        authenticatedHandler('/getReleaseTracks', async ({ req, res, userId }) => {
            const id = requireString(req.body, 'releaseId');
            const release = await sqliteReleaseCatalog.getRelease(id);
            if (!release) throw new NotFoundError('Release was not found in the local catalogue');
            const media = release.media.map((medium) => ({
                ...medium,
                tracks:
                    medium.tracks?.map(({ recordingId: _recordingId, ...track }) => track) ?? null,
            }));
            const knownLyrics = Object.fromEntries(
                release.media.flatMap((medium) =>
                    (medium.tracks ?? []).flatMap(({ id: trackId, lyricsUrl }) =>
                        lyricsUrl ? [[trackId, lyricsUrl] as const] : [],
                    ),
                ),
            );
            const [images, lyrics] = await Promise.all([
                planner.planReleaseArtistProfileImages({ userId, release, ttl: undefined }),
                v1
                    ? (() => {
                          const taskId = queueTrackLyricsTask(
                              userId,
                              release.id,
                              collectTrackLyricsRequests(release),
                              undefined,
                              'v1',
                              knownLyrics,
                          );
                          addTaskUser(taskId, userId);
                          return { taskId, resolved: {} };
                      })()
                    : planner.planReleaseTrackLyrics({ userId, release, ttl: undefined }),
            ]);
            res.json({
                media,
                lyricsTaskId: lyrics.taskId,
                profileImageTaskId: images.taskId,
                ...(v1
                    ? {}
                    : {
                          profileImages: images.resolved,
                          trackLyrics: { ...knownLyrics, ...lyrics.resolved },
                      }),
            });
        }),
    );
    return router;
};
