import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createGetNewReleasesUseCase } from '../src/features/releases/usecases/getNewReleases.js';
import { createGetArtistReleasesPageUseCase } from '../src/features/releases/usecases/getArtistReleasesPage.js';
import { createGetReleaseUseCase } from '../src/features/releases/usecases/getRelease.js';
import { createGetReleaseGroupReleasesUseCase } from '../src/features/releases/usecases/getReleaseGroupReleases.js';
import { createRemoveNewReleasesUseCase } from '../src/features/releases/usecases/removeNewReleases.js';
import { createDefaultAssetPlanner } from './helpers/assetPlannerFakes.js';
import { createGetNewReleasesDependencies } from './helpers/releaseUseCaseFakes.js';
import { createNewRelease, createRelease } from './helpers/releaseFixtures.js';
import type {
    ReleaseCatalogGateway,
    ReleaseReadUseCaseDependencies,
    ReleaseWriteUseCaseDependencies,
} from '../src/features/releases/ports.js';

const fakeRequestDeduper = {
    async run<T>(_key: string, worker: () => Promise<T>): Promise<T> {
        return worker();
    },
    invalidate(): void {},
};

const createGateway = (overrides: Partial<ReleaseCatalogGateway> = {}): ReleaseCatalogGateway => ({
    getArtistReleasesPage: async () => ({
        releaseGroups: [],
        hasMore: false,
        nextCursor: null,
    }),
    async getArtistReleases() {
        return [];
    },
    async getReleaseGroupReleases() {
        return null;
    },
    async getRelease() {
        return null;
    },
    async releaseExists() {
        return false;
    },
    ...overrides,
});

const createReleaseTaskQueue = (calls: {
    addedTaskUsers: string[];
    queuedLyrics: number;
    queuedProfiles: number;
    queuedGroupCovers: number;
}) => ({
    addTaskUser(taskId: string) {
        calls.addedTaskUsers.push(taskId);
    },
    queueArtistReleaseGroupCovers() {
        return '';
    },
    queueReleaseGroupReleaseCovers() {
        calls.queuedGroupCovers += 1;
        return 'group-covers';
    },
    queueNewReleaseCovers() {
        return '';
    },
    queueReleaseTrackLyrics() {
        calls.queuedLyrics += 1;
        return 'lyrics-task';
    },
    queueReleaseArtistProfileImages() {
        calls.queuedProfiles += 1;
        return 'profile-task';
    },
});

describe('release use cases', () => {
    it('sorts new releases by date and never plans covers in the feed request', async () => {
        const state = createGetNewReleasesDependencies(
            {
                newReleasesMap: {
                    exact: createNewRelease({
                        id: 'exact',
                        date: '2026-02-10',
                        date_for_display: '10.02.2026',
                    }),
                    older: createNewRelease({
                        id: 'older',
                        date: '2025-01-01',
                        date_for_display: '01.01.2025',
                    }),
                    unknown: createNewRelease({
                        id: 'unknown',
                        date: null,
                        date_for_display: 'Unknown date',
                    }),
                },
                coverPageEntries: [{ releaseGroupId: 'group-1', releaseIds: ['exact', 'older'] }],
            },
            createDefaultAssetPlanner({
                planNewReleaseCovers: async () => {
                    throw new Error('getNewReleases must not plan covers');
                },
                peekNewReleaseCovers: async () => ({}),
            }),
        );

        const result = await createGetNewReleasesUseCase(state.dependencies)('user-1');

        assert.deepEqual(
            result.releases.map((release) => release.id),
            ['exact', 'older', 'unknown'],
        );
        assert.equal(result.releaseCoverTaskId, null);
        assert.deepEqual(result.releaseCovers, {});
    });

    it('fetches artist releases, queues cover tasks, and adds task user', async () => {
        const calls = {
            addedTaskUsers: [] as string[],
            queuedLyrics: 0,
            queuedProfiles: 0,
            queuedGroupCovers: 0,
        };
        const deps: Pick<
            ReleaseReadUseCaseDependencies,
            'releaseCatalogGateway' | 'releaseTaskQueue' | 'assetPlanner' | 'requestDeduper'
        > = {
            assetPlanner: createDefaultAssetPlanner({
                planArtistReleaseGroupCovers: async () => ({
                    taskId: 'cover-task-1',
                    resolved: {},
                }),
            }),
            releaseCatalogGateway: createGateway({
                getArtistReleasesPage: async () => ({
                    releaseGroups: [
                        {
                            id: 'rg-1',
                            title: 'Album',
                            date: '2026-01-01',
                            disambiguation: null,
                            'primary-type': 'Album',
                            releaseIds: ['r1', 'r2'],
                        },
                    ],
                    hasMore: false,
                    nextCursor: null,
                }),
            }),
            releaseTaskQueue: createReleaseTaskQueue(calls),
            requestDeduper: fakeRequestDeduper,
        };

        const result = await createGetArtistReleasesPageUseCase(deps)('user-1', 'artist-1');

        assert.equal(result.releaseGroups.length, 1);
        assert.equal(result.releaseGroups[0]!.id, 'rg-1');
        assert.equal(result.releaseGroupCoverTaskId, 'cover-task-1');
        assert.deepEqual(calls.addedTaskUsers, ['cover-task-1']);
    });

    describe('getRelease', () => {
        it('returns metadata, tracks, immediate lyrics/images and both task ids', async () => {
            const calls = {
                addedTaskUsers: [] as string[],
                queuedLyrics: 0,
                queuedProfiles: 0,
                queuedGroupCovers: 0,
            };
            const release = createRelease({
                id: 'release-1',
                media: [
                    {
                        'track-count': 1,
                        format: 'CD',
                        position: 1,
                        tracks: [
                            {
                                id: 'release-1:1:1',
                                recordingId: 'recording-1',
                                title: 'Song',
                                'artist-credit': [
                                    { id: 'artist-1', name: 'Artist One', joinphrase: null },
                                ],
                                length: 1000,
                                lyricsUrl: 'https://genius.com/song',
                            },
                        ],
                    },
                ],
            });

            const deps: Pick<
                ReleaseReadUseCaseDependencies,
                'releaseCatalogGateway' | 'releaseTaskQueue' | 'assetPlanner' | 'requestDeduper'
            > = {
                assetPlanner: createDefaultAssetPlanner({
                    planReleaseArtistProfileImages: async () => ({
                        taskId: null,
                        resolved: { 'artist-1': 'https://img.example/a.jpg' },
                    }),
                    planReleaseTrackLyrics: async () => ({
                        taskId: null,
                        resolved: { 'release-1:1:1': 'https://lyrics.example/song' },
                    }),
                }),
                releaseCatalogGateway: createGateway({
                    getRelease: async () => release,
                }),
                releaseTaskQueue: createReleaseTaskQueue(calls),
                requestDeduper: fakeRequestDeduper,
            };

            const result = await createGetReleaseUseCase(deps)('user-1', 'release-1');

            assert.ok(result);
            assert.equal(result.release.id, 'release-1');
            assert.equal(result.release.media[0]?.tracks?.[0]?.recordingId, 'recording-1');
            assert.deepEqual(result.trackLyrics, {
                'release-1:1:1': 'https://lyrics.example/song',
            });
            assert.deepEqual(result.profileImages, {
                'artist-1': 'https://img.example/a.jpg',
            });
            assert.equal(result.lyricsTaskId, null);
            assert.equal(result.profileImageTaskId, null);
        });

        it('returns null on a local miss without remote fallback', async () => {
            const deps: Pick<
                ReleaseReadUseCaseDependencies,
                'releaseCatalogGateway' | 'assetPlanner' | 'requestDeduper'
            > = {
                assetPlanner: createDefaultAssetPlanner(),
                releaseCatalogGateway: createGateway(),
                requestDeduper: fakeRequestDeduper,
            };

            assert.equal(
                await createGetReleaseUseCase(deps as ReleaseReadUseCaseDependencies)(
                    'user-1',
                    'missing',
                ),
                null,
            );
        });
    });

    describe('getReleaseGroupReleases', () => {
        it('returns one local group snapshot and queues covers once', async () => {
            const calls = {
                addedTaskUsers: [] as string[],
                queuedLyrics: 0,
                queuedProfiles: 0,
                queuedGroupCovers: 0,
            };
            const deps: Pick<
                ReleaseReadUseCaseDependencies,
                'releaseCatalogGateway' | 'releaseTaskQueue' | 'assetPlanner' | 'requestDeduper'
            > = {
                assetPlanner: createDefaultAssetPlanner({
                    planReleaseGroupReleaseCovers: async ({ pageEntries }) => {
                        assert.deepEqual(pageEntries, [
                            { releaseGroupId: 'group-1', releaseIds: ['r1', 'r2'] },
                        ]);
                        return { taskId: 'group-covers', resolved: {} };
                    },
                }),
                releaseCatalogGateway: createGateway({
                    getReleaseGroupReleases: async () => ({
                        releaseGroup: {
                            id: 'group-1',
                            title: 'Album',
                            date: '2026-01-01',
                            disambiguation: null,
                            'primary-type': 'Album',
                        },
                        releases: [
                            {
                                id: 'r1',
                                title: 'Album',
                                date: '2026-01-01',
                                trackCount: 10,
                                formats: ['CD'],
                                country: null,
                                status: 'Official',
                            },
                            {
                                id: 'r2',
                                title: 'Album',
                                date: '2026-01-02',
                                trackCount: 12,
                                formats: ['CD', 'DVD'],
                                country: null,
                                status: 'Official',
                            },
                        ],
                        releaseCount: 2,
                    }),
                }),
                releaseTaskQueue: createReleaseTaskQueue(calls),
                requestDeduper: fakeRequestDeduper,
            };

            const result = await createGetReleaseGroupReleasesUseCase(deps)('user-1', 'group-1');

            assert.ok(result);
            assert.equal(result.releaseGroup.title, 'Album');
            assert.equal(result.releaseCount, 2);
            assert.equal(result.releases.length, 2);
            assert.equal(result.releaseCoverTaskId, 'group-covers');
            assert.deepEqual(calls.addedTaskUsers, ['group-covers']);
        });

        it('distinguishes a missing group from a known empty group', async () => {
            const deps: Pick<
                ReleaseReadUseCaseDependencies,
                'releaseCatalogGateway' | 'assetPlanner' | 'requestDeduper'
            > = {
                assetPlanner: createDefaultAssetPlanner(),
                releaseCatalogGateway: createGateway(),
                requestDeduper: fakeRequestDeduper,
            };

            assert.equal(
                await createGetReleaseGroupReleasesUseCase(deps as ReleaseReadUseCaseDependencies)(
                    'user-1',
                    'missing',
                ),
                null,
            );
        });
    });

    it('deletes releases and notifies clients', async () => {
        let deleted: string[] = [];
        let notified: string | undefined;
        const deps: Pick<
            ReleaseWriteUseCaseDependencies,
            'newReleasesRepository' | 'releaseNotifier'
        > = {
            newReleasesRepository: {
                async getNewReleasesSnapshot() {
                    return { newReleasesMap: {}, coverPageEntries: [] };
                },
                async deleteNewReleases(_userId, releaseIds) {
                    deleted = releaseIds;
                },
            },
            releaseNotifier: {
                async notifyReleasesChanged(_userId, sourcePushToken) {
                    notified = sourcePushToken;
                },
            },
        };

        await createRemoveNewReleasesUseCase(deps)('user-1', ['r1', 'r2'], 'push');

        assert.deepEqual(deleted, ['r1', 'r2']);
        assert.equal(notified, 'push');
    });
});
