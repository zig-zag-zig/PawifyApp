import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import express from 'express';
import { errorMiddleware } from '../../src/common/http/errorMiddleware.js';
import { rejectUnsupportedApiVersions } from '../../src/api/legacyVersionRejection.js';
import { healthRoutes } from '../../src/features/health/healthRoutes.js';
import { startTestServer, stopTestServer } from '../helpers/httpTestApp.js';

let baseUrl: string;

before(async () => {
    const app = express();
    app.use(express.json());
    app.use(healthRoutes);
    app.use(rejectUnsupportedApiVersions());
    // Route-family integration lives in the per-feature route tests; this file
    // only pins the version gate and unversioned probes.
    app.use('/v3', healthRoutes);
    app.use(errorMiddleware);
    baseUrl = await startTestServer(app);
});

after(async () => {
    await stopTestServer();
});

describe('API version cutover', () => {
    it('serves the supported contract under /v3', async () => {
        const response = await fetch(`${baseUrl}/v3/health`);
        assert.equal(response.status, 200);
    });

    it('rejects v1 and v2 clearly instead of aliasing them', async () => {
        for (const version of ['v1', 'v2']) {
            const response = await fetch(`${baseUrl}/${version}/health`);
            assert.equal(response.status, 410);
            const body = (await response.json()) as { code: string; message: string };
            assert.equal(body.code, 'API_VERSION_UNSUPPORTED');
            assert.match(body.message, /upgrade/i);
        }
    });

    it('keeps unversioned liveness and readiness operational', async () => {
        assert.equal((await fetch(`${baseUrl}/health`)).status, 200);
    });
});
