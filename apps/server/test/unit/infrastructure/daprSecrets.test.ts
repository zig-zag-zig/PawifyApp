import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { installFetch } from '../../helpers/daprTestHelpers.js';

const SECRET_URL = 'http://dapr.test/v1.0/secrets/pawify-secrets/tidal-token';

const jsonResponse = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });

/**
 * Mirrors what the sidecar actually returns for a key the local file secret
 * store does not hold. It is a 500, not the 404 the API contract implies.
 */
const missingSecretResponse = (key: string): Response =>
    jsonResponse(
        {
            errorCode: 'ERR_SECRET_GET',
            message: `failed getting secret with key ${key} from secret store pawify-secrets: secret ${key} not found`,
        },
        500,
    );

beforeEach(async () => {
    const { clearDaprSecretCache } =
        await import('../../../src/infrastructure/dapr/daprSecrets.js');
    clearDaprSecretCache();
});

describe('getDaprSecret', () => {
    it('returns the stored value', async () => {
        installFetch(() => jsonResponse({ 'tidal-token': 'secret-token' }));

        const { getDaprSecret } = await import('../../../src/infrastructure/dapr/daprSecrets.js');

        assert.equal(await getDaprSecret('tidal-token'), 'secret-token');
    });

    it('treats the local file store 500 for an absent key as a missing secret', async () => {
        installFetch(() => missingSecretResponse('tidal-token'));

        const { getDaprSecret } = await import('../../../src/infrastructure/dapr/daprSecrets.js');

        // Optional credentials rely on undefined here so callers reach their
        // fallback chain instead of throwing away the surrounding work.
        assert.equal(await getDaprSecret('tidal-token'), undefined);
    });

    it('caches a missing secret instead of retrying it on every call', async () => {
        const calls: string[] = [];
        installFetch((url) => {
            calls.push(url);
            return missingSecretResponse('tidal-token');
        });

        const { getDaprSecret } = await import('../../../src/infrastructure/dapr/daprSecrets.js');

        assert.equal(await getDaprSecret('tidal-token'), undefined);
        assert.equal(await getDaprSecret('tidal-token'), undefined);
        assert.deepEqual(calls, [SECRET_URL]);
    });

    it('treats a 404 as a missing secret', async () => {
        installFetch(() => new Response(null, { status: 404 }));

        const { getDaprSecret } = await import('../../../src/infrastructure/dapr/daprSecrets.js');

        assert.equal(await getDaprSecret('tidal-token'), undefined);
    });

    it('still surfaces a real secret store failure', async () => {
        installFetch(() =>
            jsonResponse(
                {
                    errorCode: 'ERR_SECRET_GET',
                    message:
                        'failed getting secret with key tidal-token from secret store pawify-secrets: open /var/pawify/secrets/dapr-secrets.json: permission denied',
                },
                500,
            ),
        );

        const { getDaprSecret } = await import('../../../src/infrastructure/dapr/daprSecrets.js');
        const { DaprHttpError } = await import('../../../src/infrastructure/dapr/daprClient.js');

        await assert.rejects(
            getDaprSecret('tidal-token'),
            (error: unknown) =>
                error instanceof DaprHttpError &&
                error.status === 500 &&
                error.message === 'read Dapr secret tidal-token: HTTP 500',
        );
    });
});
