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
    const { taskRoutes } = await import('../../src/features/tasks/taskRoutes.js');
    baseUrl = await createIntegrationTestApp(taskRoutes);
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

describe('task route integration', () => {
    const authHeader = { Authorization: 'Bearer valid-token' };

    describe('POST /v1/getTaskResult', () => {
        it('returns 401 without authorization', async () => {
            const response = await fetch(`${baseUrl}/v1/getTaskResult`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId: 'task-1' }),
            });
            assert.equal(response.status, 401);
        });

        it('returns 400 when taskId is missing', async () => {
            const response = await fetch(`${baseUrl}/v1/getTaskResult`, {
                method: 'POST',
                headers: { ...authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            assert.equal(response.status, 400);
        });
    });
});
