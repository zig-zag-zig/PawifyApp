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
    const { userSettingsRoutes } =
        await import('../../src/features/userSettings/userSettingsRoutes.js');
    baseUrl = await createIntegrationTestApp(userSettingsRoutes);
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

describe('user settings route integration', () => {
    const authHeader = { Authorization: 'Bearer valid-token' };

    describe('GET /v1/getReleaseNotificationSettings', () => {
        it('returns 401 without authorization', async () => {
            const response = await fetch(`${baseUrl}/v1/getReleaseNotificationSettings`);
            assert.equal(response.status, 401);
        });
    });

    describe('POST /v1/updateReleaseNotificationSettings', () => {
        it('returns 401 without authorization', async () => {
            const response = await fetch(`${baseUrl}/v1/updateReleaseNotificationSettings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    oldestReleaseDateMonths: null,
                    includeReleasesWithoutDate: true,
                }),
            });
            assert.equal(response.status, 401);
        });

        it('returns 400 when body is missing required fields', async () => {
            const response = await fetch(`${baseUrl}/v1/updateReleaseNotificationSettings`, {
                method: 'POST',
                headers: { ...authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            assert.equal(response.status, 400);
        });

        it('returns 400 when includeReleasesWithoutDate is invalid', async () => {
            const response = await fetch(`${baseUrl}/v1/updateReleaseNotificationSettings`, {
                method: 'POST',
                headers: { ...authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    oldestReleaseDateMonths: null,
                    includeReleasesWithoutDate: 'no',
                }),
            });
            assert.equal(response.status, 400);
        });
    });
});
