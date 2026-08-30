import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
    createIntegrationTestApp,
    installAllFakes,
    setFakeCheckAuth,
    stopTestServer,
} from '../helpers/httpTestApp.js';
import { installModuleFake } from '../helpers/moduleFakes.js';

installAllFakes();

let baseUrl: string;

beforeEach(async () => {
    const { createReleaseRoutes } = await import('../../src/features/releases/releaseRoutes.js');
    const { releasePresentersV1, releaseUseCasesV1 } =
        await import('../../src/api/useCaseVariants.js');
    baseUrl = await createIntegrationTestApp(
        createReleaseRoutes(releaseUseCasesV1, releasePresentersV1),
    );
});

afterEach(async () => {
    await stopTestServer();
    setFakeCheckAuth(async (req) => {
        const header = req.headers.authorization;
        if (!header?.startsWith('Bearer ')) {
            throw new Error('Unauthorized');
        }
        return 'test-user-id';
    });
});

describe('release route integration', () => {
    const authHeader = { Authorization: 'Bearer valid-token' };

    describe('GET /v1/getNewReleases', () => {
        it('returns 401 without authorization', async () => {
            const response = await fetch(`${baseUrl}/v1/getNewReleases`);
            assert.equal(response.status, 401);
        });
    });

    describe('POST /v1/removeNewReleases', () => {
        it('returns 400 when releaseIds is missing', async () => {
            const response = await fetch(`${baseUrl}/v1/removeNewReleases`, {
                method: 'POST',
                headers: { ...authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            assert.equal(response.status, 400);
        });

        it('returns 401 without authorization', async () => {
            const response = await fetch(`${baseUrl}/v1/removeNewReleases`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ releaseIds: ['r1'] }),
            });
            assert.equal(response.status, 401);
        });

        it('returns 400 when releaseIds exceeds the 500-item cap', async () => {
            const response = await fetch(`${baseUrl}/v1/removeNewReleases`, {
                method: 'POST',
                headers: { ...authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    releaseIds: Array.from({ length: 501 }, (_, index) => `release-${index}`),
                }),
            });
            assert.equal(response.status, 400);
        });
    });

    describe('POST /v1/removeNewReleases (best-effort notifications)', () => {
        it('returns 200 even when the change notification fails', async () => {
            const publisherPath =
                require.resolve('../../src/services/notifications/dataNotificationPublisher.js');
            const originalPublisher = require.cache[publisherPath];
            installModuleFake('../../src/services/notifications/dataNotificationPublisher.js', {
                sendDataOnlyNotification: async () => {
                    throw new Error('expo push failed');
                },
            });

            // The notifier adapter binds sendDataOnlyNotification at module
            // evaluation, so re-evaluate the dependency chain via require()
            // (which bypasses the ESM loader cache) after the fake swap.
            for (const modulePath of [
                '../../src/features/releases/infrastructure/releaseInfrastructureAdapters.js',
                '../../src/features/releases/releaseUseCases.js',
                '../../src/api/useCaseVariants.js',
            ]) {
                delete require.cache[require.resolve(modulePath)];
            }

            try {
                const { createReleaseRoutes } =
                    require('../../src/features/releases/releaseRoutes.js') as typeof import('../../src/features/releases/releaseRoutes.js');
                const { releasePresentersV1, releaseUseCasesV1 } =
                    require('../../src/api/useCaseVariants.js') as typeof import('../../src/api/useCaseVariants.js');
                const testBaseUrl = await createIntegrationTestApp(
                    createReleaseRoutes(releaseUseCasesV1, releasePresentersV1),
                );

                const response = await fetch(`${testBaseUrl}/v1/removeNewReleases`, {
                    method: 'POST',
                    headers: { ...authHeader, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ releaseIds: ['release-1', 'release-2'] }),
                });
                assert.equal(response.status, 200);
            } finally {
                if (originalPublisher) {
                    require.cache[publisherPath] = originalPublisher;
                } else {
                    delete require.cache[publisherPath];
                }
            }
        });
    });

    describe('POST /v1/getArtistReleases', () => {
        it('returns 400 when artistId is missing', async () => {
            const response = await fetch(`${baseUrl}/v1/getArtistReleases`, {
                method: 'POST',
                headers: { ...authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            assert.equal(response.status, 400);
        });

        it('returns 401 without authorization', async () => {
            const response = await fetch(`${baseUrl}/v1/getArtistReleases`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ artistId: 'artist-1' }),
            });
            assert.equal(response.status, 401);
        });
    });

    describe('POST /v1/getReleaseGroupReleases', () => {
        it('returns 400 when releaseGroupId is missing', async () => {
            const response = await fetch(`${baseUrl}/v1/getReleaseGroupReleases`, {
                method: 'POST',
                headers: { ...authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            assert.equal(response.status, 400);
        });

        it('returns 401 without authorization', async () => {
            const response = await fetch(`${baseUrl}/v1/getReleaseGroupReleases`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ releaseGroupId: 'rg-1' }),
            });
            assert.equal(response.status, 401);
        });
    });

    describe('POST /v1/getRelease', () => {
        it('returns 400 when releaseId is missing', async () => {
            const response = await fetch(`${baseUrl}/v1/getRelease`, {
                method: 'POST',
                headers: { ...authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            assert.equal(response.status, 400);
        });

        it('returns 401 without authorization', async () => {
            const response = await fetch(`${baseUrl}/v1/getRelease`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ releaseId: 'test' }),
            });
            assert.equal(response.status, 401);
        });
    });

    describe('POST /v1/verifyReleaseExistence', () => {
        it('returns 400 when releaseId is missing', async () => {
            const response = await fetch(`${baseUrl}/v1/verifyReleaseExistence`, {
                method: 'POST',
                headers: { ...authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            assert.equal(response.status, 400);
        });

        it('returns 401 without authorization', async () => {
            const response = await fetch(`${baseUrl}/v1/verifyReleaseExistence`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ releaseId: 'test-release' }),
            });
            assert.equal(response.status, 401);
        });
    });
});
