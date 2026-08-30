import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createLegacyAssetPlanner } from '../src/services/backgroundAssets/legacyAssetPlanner.js';
import { createCacheFirstAssetPlanner } from '../src/services/backgroundAssets/cacheFirstAssetPlanner.js';
import { createDefaultCacheAssetPartitioner } from './helpers/partitionFakes.js';
import { installFirebaseServiceFake } from './helpers/moduleFakes.js';
import type {
    ArtistProfileImageQueuePort,
    ReleaseTaskQueuePort,
} from '../src/services/backgroundAssets/plannerTypes.js';
import type { AssetCachePartitioner } from '../src/services/cache/partitionCachedAssets.js';

installFirebaseServiceFake();

const createQueuePorts = (calls: {
    queueArtistProfileImagesWithLookups: number;
    queueNewReleaseCovers: number;
}) => {
    const artistProfileImageQueue: ArtistProfileImageQueuePort = {
        queueArtistProfileImages() {
            return 'task';
        },
        queueArtistProfileImagesWithLookups() {
            calls.queueArtistProfileImagesWithLookups += 1;
            return 'profile-task';
        },
    };
    const releaseTaskQueue: ReleaseTaskQueuePort = {
        addTaskUser() {},
        queueArtistReleaseGroupCovers() {
            return 'rg-covers';
        },
        queueReleaseGroupReleaseCovers() {
            return 'rg-releases';
        },
        queueNewReleaseCovers() {
            calls.queueNewReleaseCovers += 1;
            return 'new-covers';
        },
        queueReleaseTrackLyrics() {
            return 'lyrics';
        },
        queueReleaseArtistProfileImages() {
            return 'release-profile';
        },
    };
    return { artistProfileImageQueue, releaseTaskQueue };
};

const release = {
    id: 'release-1',
    title: 'Test',
    'artist-credit': [{ id: 'artist-1', name: 'Artist One', joinphrase: null }],
    media: [
        {
            'track-count': 1,
            tracks: [
                {
                    id: 'track-1',
                    title: 'Song One',
                    'artist-credit': [{ id: 'artist-1', name: 'Artist One', joinphrase: null }],
                    length: 100,
                },
            ],
        },
    ],
} as any;

describe('background asset planners', () => {
    describe('legacy planner (v1)', () => {
        it('queues the full lookups and always returns a string task id with no resolved values', async () => {
            const calls = { queueArtistProfileImagesWithLookups: 0, queueNewReleaseCovers: 0 };
            const planner = createLegacyAssetPlanner(createQueuePorts(calls));
            const lookups = [
                { artistId: 'artist-1', artistName: 'One' },
                { artistId: 'artist-2', artistName: 'Two' },
            ];

            const plan = await planner.planArtistProfileImages({
                userId: 'user-1',
                scope: 'following',
                lookups,
                ttl: undefined,
            });

            assert.equal(plan.taskId, 'profile-task');
            assert.deepEqual(plan.resolved, {});
            assert.equal(calls.queueArtistProfileImagesWithLookups, 1);
        });

        it('queues every cover page entry for new releases', async () => {
            const calls = { queueArtistProfileImagesWithLookups: 0, queueNewReleaseCovers: 0 };
            const planner = createLegacyAssetPlanner(createQueuePorts(calls));

            const plan = await planner.planNewReleaseCovers({
                userId: 'user-1',
                pageEntries: [{ releaseGroupId: 'rg-1', releaseIds: ['r1'] }],
            });

            assert.equal(plan.taskId, 'new-covers');
            assert.equal(calls.queueNewReleaseCovers, 1);
        });
    });

    describe('cache-first planner (v2)', () => {
        it('returns null task id and resolved values when everything is cached', async () => {
            const calls = { queueArtistProfileImagesWithLookups: 0, queueNewReleaseCovers: 0 };
            const partitioner: AssetCachePartitioner = {
                ...createDefaultCacheAssetPartitioner(),
                partitionArtistProfileImages: async () => ({
                    resolved: { 'artist-1': 'https://img.example/a.jpg' },
                    pending: [],
                }),
            };
            const planner = createCacheFirstAssetPlanner({
                ...createQueuePorts(calls),
                cacheAssetPartitioner: partitioner,
            });

            const plan = await planner.planArtistProfileImages({
                userId: 'user-1',
                scope: 'following',
                lookups: [{ artistId: 'artist-1' }],
                ttl: undefined,
            });

            assert.equal(plan.taskId, null);
            assert.deepEqual(plan.resolved, { 'artist-1': 'https://img.example/a.jpg' });
            assert.equal(calls.queueArtistProfileImagesWithLookups, 0);
        });

        it('queues only the pending subset and resolves cached values', async () => {
            const calls = { queueArtistProfileImagesWithLookups: 0, queueNewReleaseCovers: 0 };
            const partitioner: AssetCachePartitioner = {
                ...createDefaultCacheAssetPartitioner(),
                partitionArtistProfileImages: async (lookups) => ({
                    resolved: { [lookups[0]!.artistId]: 'https://img.example/a.jpg' },
                    pending: lookups.slice(1),
                }),
            };
            const planner = createCacheFirstAssetPlanner({
                ...createQueuePorts(calls),
                cacheAssetPartitioner: partitioner,
            });

            const plan = await planner.planArtistProfileImages({
                userId: 'user-1',
                scope: 'search:band:25:0',
                lookups: [
                    { artistId: 'artist-1', artistName: 'One' },
                    { artistId: 'artist-2', artistName: 'Two' },
                ],
                ttl: undefined,
            });

            assert.equal(plan.taskId, 'profile-task');
            assert.deepEqual(plan.resolved, { 'artist-1': 'https://img.example/a.jpg' });
            assert.equal(calls.queueArtistProfileImagesWithLookups, 1);
        });

        it('decomposes releases into tracks and artist ids for lyrics and images', async () => {
            const calls = { queueArtistProfileImagesWithLookups: 0, queueNewReleaseCovers: 0 };
            const planner = createCacheFirstAssetPlanner({
                ...createQueuePorts(calls),
                cacheAssetPartitioner: {
                    ...createDefaultCacheAssetPartitioner(),
                    partitionArtistProfileImages: async () => ({
                        resolved: {},
                        pending: [{ artistId: 'artist-1' }],
                    }),
                    partitionTrackLyrics: async (_releaseId, tracks) => ({
                        resolved: {},
                        pending: tracks,
                    }),
                },
            });

            const lyricsPlan = await planner.planReleaseTrackLyrics({
                userId: 'user-1',
                release,
                ttl: undefined,
            });
            const imagesPlan = await planner.planReleaseArtistProfileImages({
                userId: 'user-1',
                release,
                ttl: undefined,
            });

            assert.equal(lyricsPlan.taskId, 'lyrics');
            assert.equal(imagesPlan.taskId, 'release-profile');
        });
    });

    describe('task key namespace', () => {
        it('prefixes v2 keys and leaves v1 keys untouched', async () => {
            const { withTaskKeyNamespace } =
                await import('../src/services/backgroundTaskWorkers.js');
            assert.equal(
                withTaskKeyNamespace(undefined, 'artist_profile_images:following:a,b'),
                'artist_profile_images:following:a,b',
            );
            assert.equal(
                withTaskKeyNamespace('v1', 'artist_profile_images:following:a,b'),
                'artist_profile_images:following:a,b',
            );
            assert.equal(
                withTaskKeyNamespace('v2', 'artist_profile_images:following:a,b'),
                'v2:artist_profile_images:following:a,b',
            );
        });
    });
});
