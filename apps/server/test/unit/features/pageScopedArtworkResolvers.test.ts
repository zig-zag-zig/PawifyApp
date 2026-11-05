import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createDefaultAssetPlanner } from '../../helpers/assetPlannerFakes.js';
import type { ArtistReadUseCaseDependencies } from '../../../src/features/artists/ports.js';
import type { ReleaseUseCaseDependencies } from '../../../src/features/releases/ports.js';
import { createNewRelease } from '../../helpers/releaseFixtures.js';

const followingDeps = (summaryIds: string[], plannerOverrides = {}) =>
    ({
        assetPlanner: createDefaultAssetPlanner(plannerOverrides),
        artistFollowingRepository: {
            async getFollowingArtistIds() {
                return summaryIds;
            },
            async getFollowingState() {
                return {
                    artistIds: summaryIds,
                    artistSummaries: Object.fromEntries(
                        summaryIds.map((id) => [
                            id,
                            { id, name: `Name ${id}`, refreshedAt: Date.now() },
                        ]),
                    ),
                };
            },
            async saveFollowedArtist() {},
            async saveFollowingArtistSummaries() {},
            async deleteFollowedArtist() {},
        },
    }) as unknown as Pick<
        ArtistReadUseCaseDependencies,
        'assetPlanner' | 'artistFollowingRepository'
    >;

describe('resolveFollowingArtistImages', () => {
    it('plans images only for the requested page and returns the task id', async () => {
        let plannedIds: string[] = [];
        const { createResolveFollowingArtistImagesUseCase } = await import(
            '../../../src/features/artists/usecases/resolveFollowingArtistImages.js'
        );
        const useCase = createResolveFollowingArtistImagesUseCase(
            followingDeps(['a1', 'a2', 'a3'], {
                planArtistProfileImages: async ({ lookups }: { lookups: { artistId: string }[] }) => {
                    plannedIds = lookups.map((lookup) => lookup.artistId);
                    return { taskId: 'page-task', resolved: { a2: 'https://img/2.jpg' } };
                },
            }),
        );

        const result = await useCase('user-1', ['a2', 'a3']);

        assert.deepEqual(plannedIds, ['a2', 'a3']);
        assert.equal(result.profileImageTaskId, 'page-task');
        assert.deepEqual(result.profileImages, { a2: 'https://img/2.jpg' });
    });

    it('ignores artists that are not followed', async () => {
        let plannedIds: string[] = [];
        const { createResolveFollowingArtistImagesUseCase } = await import(
            '../../../src/features/artists/usecases/resolveFollowingArtistImages.js'
        );
        const useCase = createResolveFollowingArtistImagesUseCase(
            followingDeps(['a1'], {
                planArtistProfileImages: async ({ lookups }: { lookups: { artistId: string }[] }) => {
                    plannedIds = lookups.map((lookup) => lookup.artistId);
                    return { taskId: 'page-task', resolved: {} };
                },
            }),
        );

        const result = await useCase('user-1', ['not-followed']);

        assert.deepEqual(plannedIds, []);
        assert.equal(result.profileImageTaskId, null);
    });
});

const releaseDeps = (coverPageEntries: { releaseGroupId: string; releaseIds: string[] }[], plannerOverrides = {}) =>
    ({
        assetPlanner: createDefaultAssetPlanner(plannerOverrides),
        newReleasesRepository: {
            async getNewReleasesSnapshot() {
                return {
                    newReleasesMap: Object.fromEntries(
                        coverPageEntries.flatMap((entry) =>
                            entry.releaseIds.map((id) => [
                                id,
                                createNewRelease({ id, date: '2026-02-10', date_for_display: '10.02.2026' }),
                            ]),
                        ),
                    ),
                    coverPageEntries,
                };
            },
        },
    }) as unknown as Pick<ReleaseUseCaseDependencies, 'assetPlanner' | 'newReleasesRepository'>;

describe('resolveNewReleaseCovers', () => {
    it('plans only the requested releases and drops the rest of the group entry', async () => {
        let planned: { releaseGroupId: string; releaseIds: string[] }[] = [];
        const { createResolveNewReleaseCoversUseCase } = await import(
            '../../../src/features/releases/usecases/resolveNewReleaseCovers.js'
        );
        const useCase = createResolveNewReleaseCoversUseCase(
            releaseDeps(
                [
                    { releaseGroupId: 'g1', releaseIds: ['r1', 'r2', 'r3'] },
                    { releaseGroupId: 'g2', releaseIds: ['r9'] },
                ],
                {
                    planNewReleaseCovers: async ({ pageEntries }: { pageEntries: typeof planned }) => {
                        planned = pageEntries;
                        return { taskId: 'cover-task', resolved: { r2: 'https://c/2.jpg' } };
                    },
                },
            ),
        );

        const result = await useCase('user-1', ['r2']);

        assert.deepEqual(planned, [{ releaseGroupId: 'g1', releaseIds: ['r2'] }]);
        assert.equal(result.releaseCoverTaskId, 'cover-task');
        assert.deepEqual(result.releaseCovers, { r2: 'https://c/2.jpg' });
    });

    it('returns nothing when the requested ids are not in the feed', async () => {
        const { createResolveNewReleaseCoversUseCase } = await import(
            '../../../src/features/releases/usecases/resolveNewReleaseCovers.js'
        );
        const useCase = createResolveNewReleaseCoversUseCase(
            releaseDeps([{ releaseGroupId: 'g1', releaseIds: ['r1'] }], {
                planNewReleaseCovers: async () => {
                    throw new Error('must not plan covers for unknown releases');
                },
            }),
        );

        const result = await useCase('user-1', ['unknown']);

        assert.deepEqual(result.releaseCovers, {});
        assert.equal(result.releaseCoverTaskId, null);
    });
});
