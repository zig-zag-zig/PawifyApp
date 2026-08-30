import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
    createIntegrationTestApp,
    installAllFakes,
    setFakeCheckAuth,
    stopTestServer,
} from '../helpers/httpTestApp.js';

installAllFakes();

let baseUrl: string;

beforeEach(async () => {
    const { notificationRoutes } =
        await import('../../src/features/notifications/notificationRoutes.js');
    baseUrl = await createIntegrationTestApp(notificationRoutes);
});

afterEach(async () => {
    await stopTestServer();
    // Reset auth to default — notification routes use API key auth, not Firebase token auth,
    // but we reset for consistency with other integration tests.
    setFakeCheckAuth(async (req) => {
        const header = req.headers.authorization;
        if (!header?.startsWith('Bearer ')) {
            throw new Error('Unauthorized');
        }
        return 'test-user-id';
    });
});

describe('notification route integration', () => {
    it('GET /v1/notifyNewReleases returns 401 without API key', async () => {
        const response = await fetch(`${baseUrl}/v1/notifyNewReleases`);
        assert.equal(response.status, 401);
    });

    it('GET /v1/notifyNewReleases returns 401 with wrong API key', async () => {
        const response = await fetch(`${baseUrl}/v1/notifyNewReleases`, {
            headers: { 'x-api-key': 'wrong-key' },
        });
        assert.equal(response.status, 401);
    });
});
