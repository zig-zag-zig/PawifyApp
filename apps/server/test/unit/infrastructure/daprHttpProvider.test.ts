import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it, mock } from 'node:test';

import { installFetch } from '../../helpers/daprTestHelpers.js';

describe('Dapr provider HTTP migration', () => {
    it('invokes a Dapr HTTP endpoint once for a successful provider call', async () => {
        const calls: Array<{ url: string; init: RequestInit }> = [];
        installFetch((url, init) => {
            calls.push({ url, init });
            return new Response(JSON.stringify({ artist: 'Pawify' }), { status: 200 });
        });

        const { fetchMusicBrainzWithStatus } =
            await import('../../../src/services/musicApi/musicBrainzClient.js');
        const result = await fetchMusicBrainzWithStatus('/artist?query=test&fmt=json');

        assert.deepEqual(result, { artist: 'Pawify' });
        assert.equal(calls.length, 1);
        assert.equal(
            calls[0].url,
            'http://dapr.test/v1.0/invoke/musicbrainz/method/ws/2/artist?query=test&fmt=json',
        );
        assert.equal(
            new Headers(calls[0].init.headers).get('User-Agent'),
            'MusicReleaseNotifier/1.0',
        );
    });

    it('does not retry transient final provider failures in app code', async () => {
        let callCount = 0;
        installFetch(() => {
            callCount += 1;
            return new Response('temporary upstream failure', { status: 500 });
        });

        const { fetchDaprProvider } = await import('../../../src/services/musicApi/httpClient.js');
        const result = await fetchDaprProvider(
            'discogs',
            '/artists/1',
            { method: 'GET', headers: {} },
            false,
            false,
            'status',
        );

        assert.equal(callCount, 1);
        assert.deepEqual(result, { __fetchFailure: true, status: null });
    });

    it('cancels the response body on non-OK responses so sockets are released', async () => {
        let cancelMock: ReturnType<typeof mock.method> | undefined;
        installFetch(() => {
            const response = new Response('temporary upstream failure', { status: 503 });
            cancelMock = mock.method(response.body!, 'cancel');
            return response;
        });

        const { fetchDaprProvider } = await import('../../../src/services/musicApi/httpClient.js');
        const result = await fetchDaprProvider(
            'discogs',
            '/artists/1',
            { method: 'GET', headers: {} },
            false,
            false,
            'null',
        );

        assert.equal(result, null);
        assert.equal(cancelMock!.mock.callCount(), 1);
    });

    it('cancels the response body when an OK body is not valid JSON', async () => {
        let cancelMock: ReturnType<typeof mock.method> | undefined;
        installFetch(() => {
            const response = new Response('<html>not json</html>', { status: 200 });
            cancelMock = mock.method(response.body!, 'cancel');
            return response;
        });

        const { fetchDaprProvider } = await import('../../../src/services/musicApi/httpClient.js');
        const result = await fetchDaprProvider(
            'discogs',
            '/artists/1',
            { method: 'GET', headers: {} },
            false,
            false,
            'null',
        );

        assert.equal(result, null);
        assert.equal(cancelMock!.mock.callCount(), 1);
    });

    it('preserves HEAD success and abort behavior', async () => {
        const controller = new AbortController();
        controller.abort();
        let callCount = 0;
        installFetch(() => {
            callCount += 1;
            return new Response(null, { status: 204 });
        });

        const { fetchDaprProvider, isAbortError } =
            await import('../../../src/services/musicApi/httpClient.js');
        const headResult = await fetchDaprProvider(
            'coverartarchive',
            '/release/abc/front',
            { method: 'HEAD', headers: {} },
            true,
            true,
            'status',
        );

        await assert.rejects(
            () =>
                fetchDaprProvider(
                    'coverartarchive',
                    '/release/abc/front',
                    { method: 'HEAD', headers: {} },
                    true,
                    true,
                    'status',
                    controller.signal,
                ),
            (error) => isAbortError(error),
        );
        assert.equal(headResult, true);
        assert.equal(callCount, 1);
    });

    it('keeps retry policy in Dapr resiliency configuration', async () => {
        const resiliency = await readFile('dapr/components/resiliency.yaml', 'utf8');

        assert.match(resiliency, /httpStatusCodes: ["']429,500-599["']/);
        assert.match(resiliency, /coverartarchive:\n\s+retry: noRetry/);
        assert.match(resiliency, /musicbrainz:\n\s+retry: externalHttpRetry/);
        assert.match(resiliency, /musicbrainzTimeout: 30s/);
        assert.match(resiliency, /pawify-state:\n\s+outbound:\n\s+retry: redisRetry/);
    });

    it('reads the Redis password from the Dapr sidecar environment', async () => {
        const envSecrets = await readFile('dapr/components/env-secrets.yaml', 'utf8');
        const redisState = await readFile('dapr/components/redis-state.yaml', 'utf8');
        const redisLock = await readFile('dapr/components/redis-lock.yaml', 'utf8');

        assert.match(envSecrets, /type: secretstores\.local\.env/);
        assert.match(redisState, /secretStore: pawify-env-secrets/);
        assert.match(redisState, /name: REDIS_PASSWORD/);
        assert.match(redisLock, /secretStore: pawify-env-secrets/);
        assert.match(redisLock, /name: REDIS_PASSWORD/);
    });
});
