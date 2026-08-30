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
    const { createArtistRoutes } = await import('../../src/features/artists/artistRoutes.js');
    const { artistPresentersV1, artistUseCasesV1 } =
        await import('../../src/api/useCaseVariants.js');
    baseUrl = await createIntegrationTestApp(
        createArtistRoutes(artistUseCasesV1, artistPresentersV1),
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

describe('artist route integration', () => {
    const authHeader = { Authorization: 'Bearer valid-token' };

    describe('GET /v1/getFollowing', () => {
        it('returns 401 without authorization', async () => {
            const response = await fetch(`${baseUrl}/v1/getFollowing`);
            assert.equal(response.status, 401);
        });
    });

    describe('POST /v1/getArtistDetails', () => {
        it('returns 400 when artistId is missing', async () => {
            const response = await fetch(`${baseUrl}/v1/getArtistDetails`, {
                method: 'POST',
                headers: { ...authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            assert.equal(response.status, 400);
        });

        it('returns 401 without authorization', async () => {
            const response = await fetch(`${baseUrl}/v1/getArtistDetails`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ artistId: 'test' }),
            });
            assert.equal(response.status, 401);
        });
    });

    describe('POST /v1/searchArtists', () => {
        it('returns 400 when query is missing', async () => {
            const response = await fetch(`${baseUrl}/v1/searchArtists`, {
                method: 'POST',
                headers: { ...authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            assert.equal(response.status, 400);
        });

        it('returns 401 without authorization', async () => {
            const response = await fetch(`${baseUrl}/v1/searchArtists`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: 'test' }),
            });
            assert.equal(response.status, 401);
        });
    });

    describe('POST /v1/followArtist', () => {
        it('returns 400 when artistId is missing', async () => {
            const response = await fetch(`${baseUrl}/v1/followArtist`, {
                method: 'POST',
                headers: { ...authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            assert.equal(response.status, 400);
        });

        it('returns 401 without authorization', async () => {
            const response = await fetch(`${baseUrl}/v1/followArtist`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ artistId: 'test-artist' }),
            });
            assert.equal(response.status, 401);
        });
    });

    describe('POST /v1/unfollowArtist', () => {
        it('returns 400 when artistId is missing', async () => {
            const response = await fetch(`${baseUrl}/v1/unfollowArtist`, {
                method: 'POST',
                headers: { ...authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            assert.equal(response.status, 400);
        });

        it('returns 401 without authorization', async () => {
            const response = await fetch(`${baseUrl}/v1/unfollowArtist`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ artistId: 'test-artist' }),
            });
            assert.equal(response.status, 401);
        });
    });

    describe('POST /v1/unfollowArtists', () => {
        it('returns 400 when artistIds is missing', async () => {
            const response = await fetch(`${baseUrl}/v1/unfollowArtists`, {
                method: 'POST',
                headers: { ...authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            assert.equal(response.status, 400);
        });

        it('returns 400 when artistIds has empty string', async () => {
            const response = await fetch(`${baseUrl}/v1/unfollowArtists`, {
                method: 'POST',
                headers: { ...authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({ artistIds: [' '] }),
            });
            assert.equal(response.status, 400);
        });

        it('returns 400 when artistIds exceeds the 500-item cap', async () => {
            const response = await fetch(`${baseUrl}/v1/unfollowArtists`, {
                method: 'POST',
                headers: { ...authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    artistIds: Array.from({ length: 501 }, (_, index) => `artist-${index}`),
                }),
            });
            assert.equal(response.status, 400);
        });
    });

    describe('POST /v1/unfollowArtists (best-effort notifications)', () => {
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
                '../../src/features/artists/infrastructure/artistDependencies.js',
                '../../src/features/artists/artistUseCases.js',
                '../../src/api/useCaseVariants.js',
            ]) {
                delete require.cache[require.resolve(modulePath)];
            }

            try {
                const { createArtistRoutes } =
                    require('../../src/features/artists/artistRoutes.js') as typeof import('../../src/features/artists/artistRoutes.js');
                const { artistPresentersV1, artistUseCasesV1 } =
                    require('../../src/api/useCaseVariants.js') as typeof import('../../src/api/useCaseVariants.js');
                const testBaseUrl = await createIntegrationTestApp(
                    createArtistRoutes(artistUseCasesV1, artistPresentersV1),
                );

                const response = await fetch(`${testBaseUrl}/v1/unfollowArtists`, {
                    method: 'POST',
                    headers: { ...authHeader, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ artistIds: ['artist-1', 'artist-2'] }),
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
});
