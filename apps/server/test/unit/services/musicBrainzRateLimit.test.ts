import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

import { installFetch } from '../../helpers/daprTestHelpers.js';

process.env.MUSICBRAINZ_MIN_RATE_LIMIT_WAIT_MS = '1500';
process.env.MUSICBRAINZ_RETRY_AFTER_BUFFER_MS = '1000';

/**
 * Reads the shared bucket for a provider. Bucket state is written to Dapr state
 * under `rate_limit:<provider>`; installFetch from the test helpers answers those
 * calls in memory, so tests can assert on the shared budget directly.
 */
const readBucket = async (provider: string) => {
    const { getStateEntry } = await import('../../../src/infrastructure/dapr/daprStateStore.js');
    const { value } = await getStateEntry(`rate_limit:${provider}`);
    return value ? (JSON.parse(value) as { tokens: number; backoffUntil: number }) : null;
};

const callMusicBrainz = async (path = '/artist/1?fmt=json') => {
    const { fetchMusicBrainzWithStatus } =
        await import('../../../src/services/musicApi/musicBrainzClient.js');
    return await fetchMusicBrainzWithStatus(path);
};

/** Counts only provider invocations, ignoring the bucket's state traffic. */
const installProviderFetch = () => {
    const invocations: string[] = [];
    installFetch((url) => {
        invocations.push(url);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    return invocations;
};

describe('MusicBrainz shared rate limiting', () => {
    // A long-pause test sets a local-only backoff on the process-wide limiter;
    // clear it so later tests are not implicitly blocked.
    afterEach(async () => {
        const { getRateLimiter } = await import('../../../src/services/musicApi/rateLimiter.js');
        getRateLimiter('musicbrainz').backoffUntil = 0;
    });

    it('paces successive MusicBrainz requests instead of firing them together', async () => {
        const invocations = installProviderFetch();

        const startedAt = Date.now();
        for (let i = 0; i < 3; i += 1) {
            await callMusicBrainz(`/artist/${i}?fmt=json`);
        }
        const elapsed = Date.now() - startedAt;

        assert.equal(invocations.length, 3);
        // MusicBrainz enforces ~1/sec and penalises bursts, so two refill
        // intervals must separate three requests.
        assert.ok(elapsed >= 1800, `3 requests took ${elapsed}ms, expected them to be paced`);
    });

    it('draws its budget from the shared bucket rather than a per-process counter', async () => {
        installProviderFetch();
        await callMusicBrainz();

        const bucket = await readBucket('musicbrainz');
        assert.ok(bucket, 'expected shared musicbrainz bucket state to exist');
        // One call spent the available token, so nothing is left over.
        assert.ok(bucket!.tokens < 1, `tokens was ${bucket!.tokens}`);
    });

    it('shares one budget across foreground and background so the IP total stays bounded', async () => {
        installProviderFetch();
        const { fetchMusicBrainzWithStatus } =
            await import('../../../src/services/musicApi/musicBrainzClient.js');

        await fetchMusicBrainzWithStatus('/artist/1?fmt=json', 'GET', undefined, 'foreground');

        const startedAt = Date.now();
        await fetchMusicBrainzWithStatus('/artist/2?fmt=json', 'GET', undefined, 'background');
        const waited = Date.now() - startedAt;

        // The foreground call spent the only token, so a background call that had
        // its own budget would return immediately instead of waiting.
        assert.ok(
            waited >= 700,
            `background call waited ${waited}ms, expected it to share the bucket`,
        );
    });

    it('pauses the shared bucket when MusicBrainz reports 503', async () => {
        installFetch(
            () =>
                new Response('service unavailable', {
                    status: 503,
                    headers: { 'retry-after': '1' },
                }),
        );

        await callMusicBrainz();

        const bucket = await readBucket('musicbrainz');
        assert.ok(bucket, 'expected shared bucket state');
        // 1s from Retry-After plus the configured 1500ms minimum, buffered.
        assert.ok(
            bucket!.backoffUntil > Date.now() + 1000,
            `backoffUntil was ${bucket!.backoffUntil - Date.now()}ms away`,
        );
    });

    it('stops waiting when the surrounding task is aborted', async () => {
        installProviderFetch();

        // Spend the available token so the next call has to wait for a refill.
        await callMusicBrainz('/warm/1?fmt=json');

        const { fetchMusicBrainzWithStatus } =
            await import('../../../src/services/musicApi/musicBrainzClient.js');
        const controller = new AbortController();
        const pending = fetchMusicBrainzWithStatus(
            '/artist/slow?fmt=json',
            'GET',
            controller.signal,
        );
        controller.abort();

        await assert.rejects(pending, (error: Error) => error.name === 'AbortError');
        // Guards against the test hanging on a leftover timer.
        await delay(1);
    });

    it('still delivers when the shared state store is unavailable', async () => {
        const invocations: string[] = [];
        installFetch((url) => {
            if (url.includes('/v1.0/state/')) {
                return new Response('state store down', { status: 500 });
            }
            invocations.push(url);
            return new Response(JSON.stringify({ ok: true }), { status: 200 });
        });

        const result = await callMusicBrainz('/artist/fallback?fmt=json');

        assert.deepEqual(result, { ok: true });
        assert.equal(invocations.length, 1, 'provider call must still go out via local limiting');
    });
});
