import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

process.env.RATE_LIMIT_FALLBACK_DELAY_MS = '1';
// Read once at module load by runtimeConfig, so it must be set before the dynamic imports.
process.env.TIDAL_API_TOKEN = 'test-token';

afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
});

const importRateLimiter = async () => import('../../../src/services/musicApi/rateLimiter.js');

describe('providers that publish no rate-limit headers', () => {
    it('ignores Retry-After from Deezer, which never sends one', async () => {
        const { RateLimiter, applyRateLimitHeaders } = await importRateLimiter();
        const limiter = new RateLimiter(1, 0);

        // Measured against the real API: the quota reply is HTTP 200 with
        // {"error":{"code":4}} and an Apache/CORS-only header set. A stray
        // Retry-After must not be able to fabricate a backoff for Deezer, because
        // the only real signal is the body code handled in deezerClient.
        const response = new Response(null, {
            status: 200,
            headers: { 'retry-after': '30', 'x-ratelimit-remaining': '0' },
        });

        assert.equal(applyRateLimitHeaders(response, limiter, 'deezer'), 0);
        assert.equal(limiter.backoffUntil, 0);
    });

    it('treats a Tidal 429 as a multi-minute block even with no headers', async () => {
        const { RateLimiter, applyRateLimitHeaders } = await importRateLimiter();
        const limiter = new RateLimiter(1, 0);
        const before = Date.now();

        // Measured: Tidal 429s are empty-bodied with only CloudFront headers, and
        // the block outlasts a cumulative 78s of probing.
        const response = new Response(null, { status: 429 });

        const backoffMs = applyRateLimitHeaders(response, limiter, 'tidal');

        assert.equal(backoffMs, 60_000);
        assert.ok(limiter.backoffUntil >= before + 59_000);
    });

    it('leaves a successful Tidal response alone', async () => {
        const { RateLimiter, applyRateLimitHeaders } = await importRateLimiter();
        const limiter = new RateLimiter(1, 0);

        assert.equal(
            applyRateLimitHeaders(new Response(null, { status: 200 }), limiter, 'tidal'),
            0,
        );
        assert.equal(limiter.backoffUntil, 0);
    });

    it('still honors retry headers for providers that do publish them', async () => {
        const { RateLimiter, applyRateLimitHeaders } = await importRateLimiter();
        const limiter = new RateLimiter(1, 0);

        const response = new Response(null, {
            status: 429,
            headers: { 'retry-after': '5' },
        });

        assert.equal(applyRateLimitHeaders(response, limiter, 'discogs'), 5_000);
    });
});

describe('tidal throttle fast-fail', () => {
    it('skips Tidal entirely while the pool is paused instead of waiting out the block', async () => {
        let tidalCalls = 0;
        globalThis.fetch = (async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes('/invoke/tidal/')) {
                tidalCalls += 1;
                // Measured shape: empty body, no rate-limit headers.
                return new Response(null, { status: 429 });
            }
            return new Response(null, { status: 404 });
        }) as typeof fetch;

        const { getTidalAlbumImage } =
            await import('../../../src/services/musicApi/tidalClient.js');
        const { getRateLimiter } = await importRateLimiter();

        assert.equal(await getTidalAlbumImage(['https://tidal.com/album/566586812']), undefined);
        assert.equal(tidalCalls, 1);
        assert.ok(getRateLimiter('tidal').backoffRemainingMs() > 0);

        // Every lookup inside the pause must fail fast: a Tidal 429 blocks the
        // shared token for minutes, so waiting in the pool would hold batch slots
        // on requests that are certain to fail.
        const started = Date.now();
        for (let index = 0; index < 5; index += 1) {
            assert.equal(
                await getTidalAlbumImage([`https://tidal.com/album/${index + 1}`]),
                undefined,
            );
        }

        assert.equal(tidalCalls, 1, 'no Tidal requests may be issued while paused');
        assert.ok(Date.now() - started < 500, 'paused lookups must not block on the backoff');

        getRateLimiter('tidal').resetBackoff?.();
    });
});
