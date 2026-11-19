import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createVerifyReleaseExistenceUseCase } from '../src/features/releases/usecases/verifyReleaseExistence.js';
import type { ReleaseWriteUseCaseDependencies } from '../src/features/releases/ports.js';

const createDependencies = (exists: boolean) => {
    const dependency: Pick<ReleaseWriteUseCaseDependencies, 'releaseCatalogGateway'> = {
        releaseCatalogGateway: {
            getArtistReleasesPage: async () => ({
                releaseGroups: [],
                hasMore: false,
                nextCursor: null,
            }),
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
    };

    return dependency;
};

describe('verify release existence use case', () => {
    it('returns true from the local mirror', async () => {
        const useCase = createVerifyReleaseExistenceUseCase(createDependencies(true));
        assert.deepEqual(await useCase('request-user', 'release-1'), { exists: true });
    });

    it('reports a local miss without destructive global cleanup', async () => {
        const useCase = createVerifyReleaseExistenceUseCase(createDependencies(false));
        assert.deepEqual(await useCase('request-user', 'release-1'), { exists: false });
    });
});
