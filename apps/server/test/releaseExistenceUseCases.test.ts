import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createVerifyReleaseExistenceUseCase } from '../src/features/releases/usecases/verifyReleaseExistence.js';
import type { ReleaseWriteUseCaseDependencies } from '../src/features/releases/ports.js';

const createDependencies = (exists: boolean) => {
    const cleanupCalls: string[] = [];
    const notificationCalls: string[] = [];

    const dependencies: Pick<
        ReleaseWriteUseCaseDependencies,
        'missingReleaseCleanupRepository' | 'releaseCatalogGateway' | 'releaseNotifier'
    > = {
        missingReleaseCleanupRepository: {
            async removeMissingRelease(releaseId) {
                cleanupCalls.push(releaseId);
                return {
                    affectedUserIds: ['user-1', 'user-2'],
                    removedFromNewReleasesUserIds: ['user-2', 'user-3'],
                };
            },
        },
        releaseCatalogGateway: {
            async getArtistReleases() {
                throw new Error('getArtistReleases should not run');
            },
            async getReleaseGroupReleases() {
                throw new Error('getReleaseGroupReleases should not run');
            },
            async getRelease() {
                throw new Error('getRelease should not run');
            },
            async releaseExists() {
                return exists;
            },
        },
        releaseNotifier: {
            async notifyReleasesChanged(userId) {
                notificationCalls.push(userId);
            },
        },
    };

    return {
        cleanupCalls,
        dependencies,
        notificationCalls,
    };
};

describe('verify release existence use case', () => {
    it('returns true without cleanup when MusicBrainz still has the release', async () => {
        const state = createDependencies(true);
        const useCase = createVerifyReleaseExistenceUseCase(state.dependencies);

        const result = await useCase('request-user', 'release-1');

        assert.deepEqual(result, { exists: true });
        assert.deepEqual(state.cleanupCalls, []);
        assert.deepEqual(state.notificationCalls, []);
    });

    it('removes confirmed-missing releases and notifies users with new-release changes', async () => {
        const state = createDependencies(false);
        const useCase = createVerifyReleaseExistenceUseCase(state.dependencies);

        const result = await useCase('request-user', 'release-1');

        assert.deepEqual(result, { exists: false });
        assert.deepEqual(state.cleanupCalls, ['release-1']);
        assert.deepEqual(state.notificationCalls, ['user-2', 'user-3']);
    });
});
