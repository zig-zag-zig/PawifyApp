import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Request, Response } from 'express';

import { installModuleFake } from '../../helpers/moduleFakes.js';

describe('authenticatedHandler', () => {
    /**
     * authenticatedHandler uses runHttpRequestScope which wraps
     * everything in AsyncLocalStorage. The handler behavior (auth,
     * cache headers, error→401) is covered by integration tests.
     * These unit tests validate the boundary: that checkAuth is
     * called and its result flows to the wrapped handler context.
     */
    it('calls checkAuth with the request and returns userId via .catch wrapper', async () => {
        let checkAuthCalled = false;

        installModuleFake('../../src/services/firebase/userStore.js', {
            checkAuth: async (req: { headers: { authorization?: string } }) => {
                checkAuthCalled = true;
                assert.equal(req.headers.authorization, 'Bearer test-token');
                return 'test-user-123';
            },
            deleteUserAccount: async () => {},
            getDocumentRefAndSnapshot: async () => ({
                snapShot: {},
                ref: {
                    get: async () => ({ exists: false, data: () => null }),
                    set: async () => {},
                },
            }),
        });

        const { authenticatedHandler } =
            await import('../../../src/infrastructure/http/authenticatedHandler.js');

        const handler = authenticatedHandler('testEndpoint', async ({ userId }) => {
            assert.equal(userId, 'test-user-123');
        });

        const res = {
            statusCode: 200,
            locals: {},
            setHeader: () => {},
            status: function () {
                return this;
            },
            send: () => {},
            json: () => {},
        } as unknown as Response;

        const req = {
            method: 'GET',
            originalUrl: '/test',
            header: () => '',
            headers: { authorization: 'Bearer test-token' },
        } as unknown as Request;

        await handler(req, res, () => {});

        assert.equal(checkAuthCalled, true);
    });
});
