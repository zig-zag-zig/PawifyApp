import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { describe, it, mock } from 'node:test';

process.env.MUSICBRAINZ_RETRY_AFTER_BUFFER_MS = '1000';
process.env.MUSICBRAINZ_MIN_RATE_LIMIT_WAIT_MS = '1500';

const importRateLimiter = async () => import('../src/services/musicApi/rateLimiter.js');

describe('music API rate limiting', () => {
    it('routes every provider through one limiter without upstream URLs', async () => {
        const { getRateLimiter } = await importRateLimiter();

        // Foreground and background share one MusicBrainz budget: the provider
        // limits by IP, so separate buckets would just let background work
        // exceed the limit. Ordering is handled by the foreground drain.
        assert.equal(
            getRateLimiter('musicbrainz', 'foreground'),
            getRateLimiter('musicbrainz', 'background'),
        );
        assert.equal(getRateLimiter('discogs'), getRateLimiter('discogs'));
        assert.equal(getRateLimiter('genius'), getRateLimiter('genius'));
        assert.equal(getRateLimiter('coverartarchive'), getRateLimiter('coverartarchive'));
        assert.equal(getRateLimiter('deezer'), getRateLimiter('deezer'));
        assert.equal(getRateLimiter('tidal'), getRateLimiter('tidal'));
        assert.equal(getRateLimiter('tidalimages'), getRateLimiter('tidalimages'));
    });

    it('applies retry headers and MusicBrainz status backoff to the limiter', async () => {
        const { RateLimiter, applyRateLimitHeaders } = await importRateLimiter();
        const limiter = new RateLimiter(1, 0);
        const before = Date.now();
        const response = new Response(null, {
            status: 429,
            headers: {
                'retry-after': '2',
            },
        });

        const backoffMs = applyRateLimitHeaders(response, limiter, 'musicbrainz');

        assert.equal(backoffMs, 3000);
        assert.ok(limiter.backoffUntil >= before + backoffMs);
    });

    it('honors max concurrency until the active request releases its slot', async () => {
        const { RateLimiter } = await importRateLimiter();
        const limiter = new RateLimiter(1, 0);
        const firstRelease = await limiter.acquire();
        let secondResolved = false;
        const secondReleasePromise = limiter.acquire().then((release) => {
            secondResolved = true;
            return release;
        });

        await delay(20);
        assert.equal(secondResolved, false);
        assert.equal(limiter.activeRequests, 1);

        firstRelease();
        const secondRelease = await secondReleasePromise;

        assert.equal(secondResolved, true);
        assert.equal(limiter.activeRequests, 1);

        secondRelease();
        await delay(20);
        assert.equal(limiter.activeRequests, 0);
    });

    it('applies min rate limit wait when retry-after is below minimum', async () => {
        process.env.MUSICBRAINZ_MIN_RATE_LIMIT_WAIT_MS = '1500';
        const { RateLimiter, applyRateLimitHeaders } = await importRateLimiter();
        const limiter = new RateLimiter(1, 0);

        const response = new Response(null, {
            status: 429,
            headers: { 'retry-after': '0.5' },
        });

        const backoffMs = applyRateLimitHeaders(response, limiter, 'musicbrainz');

        // 0.5s retry-after + 1s buffer = 1500ms < 1500ms min → should clamp to 1500ms
        assert.ok(backoffMs >= 1500);
    });

    it('allows requests through when backoff has expired', async () => {
        const { RateLimiter } = await importRateLimiter();
        const limiter = new RateLimiter(1, 0);
        // Set backoff to the past
        limiter.backoffUntil = Date.now() - 1000;

        const release = await limiter.acquire();
        assert.equal(limiter.activeRequests, 1);
        release();
    });

    it('waits the documented 60s window when Discogs reports no remaining quota', async () => {
        const { RateLimiter, applyRateLimitHeaders } = await importRateLimiter();
        const limiter = new RateLimiter(1, 0);
        const before = Date.now();
        const response = new Response(null, {
            status: 200,
            headers: { 'x-discogs-ratelimit-remaining': '0' },
        });

        const backoffMs = applyRateLimitHeaders(response, limiter, 'discogs');

        // Discogs publishes no reset time; the documented window resets after 60s
        // of no requests, so that is the safest wait.
        assert.equal(backoffMs, 60_000);
        assert.ok(limiter.backoffUntil >= before + 59_000);
    });

    it('does not re-arm an active Discogs window from concurrent responses', async () => {
        const { RateLimiter, applyRateLimitHeaders } = await importRateLimiter();
        const limiter = new RateLimiter(1, 0);
        const response = new Response(null, {
            status: 200,
            headers: { 'x-discogs-ratelimit-remaining': '0' },
        });

        // First observation starts the documented window.
        assert.equal(applyRateLimitHeaders(response, limiter, 'discogs'), 60_000);
        const firstDeadline = limiter.backoffUntil;

        // A second request finishing later must not push the deadline out again.
        assert.equal(applyRateLimitHeaders(response, limiter, 'discogs'), 0);
        assert.equal(limiter.backoffUntil, firstDeadline);
    });

    it('measures the Discogs window from the last dispatch, not from now', async () => {
        const { getRateLimiter, applyRateLimitHeaders } = await importRateLimiter();
        const limiter = getRateLimiter('discogs');

        // Simulate a request dispatched 50s ago: only ~10s of the window remain.
        limiter.backoffUntil = 0;
        limiter.lastDispatchAt = Date.now() - 50_000;

        const response = new Response(null, {
            status: 200,
            headers: { 'x-discogs-ratelimit-remaining': '0' },
        });

        const backoffMs = applyRateLimitHeaders(response, limiter, 'discogs');

        assert.ok(
            backoffMs > 5_000 && backoffMs <= 11_000,
            `expected ~10s remaining, got ${backoffMs}`,
        );
    });

    it('skips the wait when the Discogs window has already elapsed', async () => {
        const { getRateLimiter, applyRateLimitHeaders } = await importRateLimiter();
        const limiter = getRateLimiter('discogs');

        limiter.backoffUntil = 0;
        limiter.lastDispatchAt = Date.now() - 120_000;

        const response = new Response(null, {
            status: 200,
            headers: { 'x-discogs-ratelimit-remaining': '0' },
        });

        assert.equal(applyRateLimitHeaders(response, limiter, 'discogs'), 0);
    });

    it('converts MusicBrainz absolute epochs into a relative backoff', async () => {
        const { RateLimiter, applyRateLimitHeaders } = await importRateLimiter();
        const limiter = new RateLimiter(1, 0);
        const resetIn10s = Math.floor(Date.now() / 1000) + 10;
        const response = new Response(null, {
            status: 200,
            headers: {
                'x-ratelimit-remaining': '0',
                'x-ratelimit-reset': String(resetIn10s),
            },
        });

        const backoffMs = applyRateLimitHeaders(response, limiter, 'musicbrainz');

        assert.ok(
            backoffMs >= 9_000 && backoffMs < 11_000,
            `backoff should be ~10s, got ${backoffMs}`,
        );
    });

    it('treats the Genius reset header as a countdown, not an epoch', async () => {
        const { RateLimiter, applyRateLimitHeaders } = await importRateLimiter();
        const limiter = new RateLimiter(1, 0);
        // Genius sends seconds remaining in the window, e.g. 77655.
        const response = new Response(null, {
            status: 200,
            headers: {
                'x-ratelimit-remaining': '0',
                'x-ratelimit-reset': '30',
            },
        });

        const backoffMs = applyRateLimitHeaders(response, limiter, 'genius');

        assert.equal(backoffMs, 30_000);
    });

    it('ignores reset timestamps already in the past', async () => {
        const { RateLimiter, applyRateLimitHeaders } = await importRateLimiter();
        const limiter = new RateLimiter(1, 0);
        const resetInPast = Math.floor(Date.now() / 1000) - 60;
        const response = new Response(null, {
            status: 200,
            headers: {
                'x-ratelimit-remaining': '0',
                'x-ratelimit-reset': String(resetInPast),
            },
        });

        const backoffMs = applyRateLimitHeaders(response, limiter, 'musicbrainz');

        assert.equal(backoffMs, 0);
        assert.equal(limiter.backoffUntil, 0);
    });

    it('does not back off when the reset window still has remaining quota', async () => {
        const { RateLimiter, applyRateLimitHeaders } = await importRateLimiter();
        const limiter = new RateLimiter(1, 0);
        const resetIn10s = Math.floor(Date.now() / 1000) + 10;
        const response = new Response(null, {
            status: 200,
            headers: {
                'x-discogs-ratelimit-remaining': '7',
                'x-ratelimit-reset': String(resetIn10s),
            },
        });

        const backoffMs = applyRateLimitHeaders(response, limiter, 'discogs');

        assert.equal(backoffMs, 0);
        assert.equal(limiter.backoffUntil, 0);
    });

    it('keeps the longer of two concurrent backoff deadlines', async () => {
        const { RateLimiter, applyRateLimitHeaders } = await importRateLimiter();
        const limiter = new RateLimiter(10, 0);

        const longResponse = new Response(null, {
            status: 429,
            headers: {
                'retry-after': '60',
            },
        });
        const shortResponse = new Response(null, {
            status: 429,
            headers: {
                'retry-after': '5',
            },
        });

        const before = Date.now();
        applyRateLimitHeaders(longResponse, limiter, 'discogs');
        const longDeadline = limiter.backoffUntil;
        applyRateLimitHeaders(shortResponse, limiter, 'discogs');

        assert.ok(
            longDeadline - before >= 59_000,
            `long deadline should be ~60s, got ${longDeadline - before}`,
        );
        assert.equal(limiter.backoffUntil, longDeadline);
    });

    it('clamps oversized backoff waits to the max timer delay instead of spinning', async () => {
        const { RateLimiter, MAX_TIMEOUT_MS } = await importRateLimiter();
        mock.timers.enable({ apis: ['setTimeout'] });
        try {
            const limiter = new RateLimiter(1, 0);
            // Backoff so far in the future that the remaining wait overflows 32-bit.
            limiter.backoffUntil = Date.now() + 2 ** 31 * 2;

            let resolved = false;
            const releasePromise = limiter.acquire().then((release) => {
                resolved = true;
                return release;
            });

            assert.equal(limiter.queue.length, 1);
            assert.equal(resolved, false);

            // Just under one clamped window: the timer has not fired yet.
            mock.timers.tick(MAX_TIMEOUT_MS - 1);
            assert.equal(resolved, false);
            assert.equal(limiter.queue.length, 1);

            // One full clamped window: processQueue re-armed once, still in backoff.
            mock.timers.tick(1);
            assert.equal(resolved, false);
            assert.equal(limiter.queue.length, 1);

            // Let the backoff expire; the next clamped pass drains the queue.
            limiter.backoffUntil = Date.now() - 1;
            mock.timers.tick(MAX_TIMEOUT_MS);
            // Mock timers defer promise continuations past a macrotask; flush them.
            await new Promise((resolve) => setImmediate(resolve));
            assert.equal(resolved, true);

            const release = await releasePromise;
            release();
        } finally {
            mock.timers.reset();
        }
    });
});
