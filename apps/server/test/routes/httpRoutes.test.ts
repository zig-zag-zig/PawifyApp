import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import express from 'express';
import { errorMiddleware } from '../../src/common/http/errorMiddleware.js';
import {
    installAllFakes,
    startTestServer,
    stopTestServer,
    setFakeCheckAuth,
} from '../helpers/httpTestApp.js';

installAllFakes();

let baseUrl: string;

beforeEach(async () => {
    const { healthRoutes } = await import('../../src/features/health/healthRoutes.js');
    const { authRoutes } = await import('../../src/features/auth/authRoutes.js');
    const { pushTokenRoutes } = await import('../../src/features/pushTokens/pushTokenRoutes.js');

    const app = express();
    app.use(express.json());
    const router = express.Router();
    router.use(healthRoutes);
    router.use(authRoutes);
    router.use(pushTokenRoutes);
    app.use('/v1', router);
    app.use(errorMiddleware);

    baseUrl = await startTestServer(app);
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

describe('HTTP route integration', () => {
    describe('public routes', () => {
        it('GET /v1/health returns 200', async () => {
            const response = await fetch(`${baseUrl}/v1/health`);
            assert.equal(response.status, 200);
            assert.equal(await response.text(), 'Server is healthy.');
        });

        it('POST /v1/sendOtp accepts email and returns success', async () => {
            const response = await fetch(`${baseUrl}/v1/sendOtp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'test@example.com' }),
            });
            assert.equal(response.status, 200);
            const body = await response.text();
            assert.equal(body, 'OTP sent successfully');
        });

        it('POST /v1/sendOtp returns 400 when email is missing', async () => {
            const response = await fetch(`${baseUrl}/v1/sendOtp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            assert.equal(response.status, 400);
        });

        it('POST /v1/sendOtp returns 400 when email is not a string', async () => {
            const response = await fetch(`${baseUrl}/v1/sendOtp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 123 }),
            });
            assert.equal(response.status, 400);
        });

        it('POST /v1/verifyOtp accepts email and otp', async () => {
            const response = await fetch(`${baseUrl}/v1/verifyOtp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'test@example.com', otp: '123456' }),
            });
            assert.equal(response.status, 200);
        });
    });

    describe('authenticated routes', () => {
        it('GET /v1/revokeToken returns 401 without authorization header', async () => {
            const response = await fetch(`${baseUrl}/v1/revokeToken`);
            assert.equal(response.status, 401);
        });

        it('GET /v1/revokeToken returns 204 with valid token', async () => {
            const response = await fetch(`${baseUrl}/v1/revokeToken`, {
                headers: { Authorization: 'Bearer valid-token' },
            });
            assert.equal(response.status, 204);
        });

        it('POST /v1/changeEmail returns 401 without authorization', async () => {
            const response = await fetch(`${baseUrl}/v1/changeEmail`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'new@example.com' }),
            });
            assert.equal(response.status, 401);
        });

        it('POST /v1/changeEmail returns 204 with valid token', async () => {
            const response = await fetch(`${baseUrl}/v1/changeEmail`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer valid-token',
                },
                body: JSON.stringify({ email: 'new@example.com' }),
            });
            assert.equal(response.status, 204);
        });

        it('POST /v1/changeEmail returns 400 when email is missing', async () => {
            const response = await fetch(`${baseUrl}/v1/changeEmail`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer valid-token',
                },
                body: JSON.stringify({}),
            });
            assert.equal(response.status, 400);
        });

        it('POST /v1/deleteUserAccount returns 401 without authorization', async () => {
            const response = await fetch(`${baseUrl}/v1/deleteUserAccount`, {
                method: 'POST',
            });
            assert.equal(response.status, 401);
        });

        it('POST /v1/deleteUserAccount returns 200 with valid token', async () => {
            const response = await fetch(`${baseUrl}/v1/deleteUserAccount`, {
                method: 'POST',
                headers: { Authorization: 'Bearer valid-token' },
            });
            assert.equal(response.status, 200);
        });
    });

    describe('push token routes', () => {
        it('POST /v1/savePushToken returns 401 without authorization', async () => {
            const response = await fetch(`${baseUrl}/v1/savePushToken`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceId: 'd1', pushToken: 'ExpoPushToken[abc]' }),
            });
            assert.equal(response.status, 401);
        });

        it('POST /v1/savePushToken returns 200 with valid token', async () => {
            const response = await fetch(`${baseUrl}/v1/savePushToken`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer valid-token',
                },
                body: JSON.stringify({ deviceId: 'd1', pushToken: 'ExpoPushToken[abc]' }),
            });
            assert.equal(response.status, 200);
        });

        it('POST /v1/deletePushToken returns 401 without authorization', async () => {
            const response = await fetch(`${baseUrl}/v1/deletePushToken`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceId: 'd1' }),
            });
            assert.equal(response.status, 401);
        });

        it('POST /v1/deletePushToken returns 200 with valid token', async () => {
            const response = await fetch(`${baseUrl}/v1/deletePushToken`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer valid-token',
                },
                body: JSON.stringify({ deviceId: 'd1' }),
            });
            assert.equal(response.status, 200);
        });
    });

    describe('v2 routes', () => {
        it('GET /v2/health returns 200', async () => {
            const { v2Routes } = await import('../../src/api/v2Routes.js');
            const app = express();
            app.use(express.json());
            app.use(v2Routes);
            app.use(errorMiddleware);
            const v2Url = await startTestServer(app);
            try {
                const response = await fetch(`${v2Url}/v2/health`);
                assert.equal(response.status, 200);
                assert.equal(await response.text(), 'Server is healthy.');
            } finally {
                await stopTestServer();
            }
        });
    });

    describe('error handling', () => {
        it('returns 404 for unknown routes', async () => {
            const response = await fetch(`${baseUrl}/v1/nonexistent`);
            assert.equal(response.status, 404);
        });

        it('returns 401 with structured error body for unauthenticated requests', async () => {
            setFakeCheckAuth(async () => {
                throw new Error('Unauthorized');
            });
            const response = await fetch(`${baseUrl}/v1/revokeToken`);
            assert.equal(response.status, 401);
            const body = await response.json();
            assert.equal(typeof body.message, 'string');
            assert.equal(body.statusCode, 401);
        });

        it('returns 400 for missing required body fields', async () => {
            const response = await fetch(`${baseUrl}/v1/verifyOtp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'test@example.com' }),
            });
            assert.equal(response.status, 400);
            const body = await response.json();
            assert.equal(body.statusCode, 400);
        });
    });
});
