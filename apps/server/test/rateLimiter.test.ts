import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { describe, it, mock } from 'node:test';

process.env.MUSICBRAINZ_RETRY_AFTER_BUFFER_MS = '1000';
process.env.MUSICBRAINZ_MIN_RATE_LIMIT_WAIT_MS = '1500';

const importRateLimiter = async () => import('../src/services/musicApi/rateLimiter.js');

describe('music API rate limiting', () => {
    it('selects provider limiters without upstream URLs', async () => {
        const { getRateLimiter } = await importRateLimiter();

        assert.notEqual(
            getRateLimiter('musicbrainz', 'foreground'),
            getRateLimiter('musicbrainz', 'background'),
        );
        assert.equal(getRateLimiter('discogs'), getRateLimiter('discogs'));
        assert.equal(getRateLimiter('genius'), getRateLimiter('genius'));
        assert.equal(getRateLimiter('coverartarchive'), getRateLimiter('coverartarchive'));
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

    it('converts absolute x-ratelimit-reset epochs into a relative backoff (discogs)', async () => {
        const { RateLimiter, applyRateLimitHeaders } = await importRateLimiter();
        const limiter = new RateLimiter(1, 0);
        const before = Date.now();
        const resetIn10s = Math.floor(Date.now() / 1000) + 10;
        const response = new Response(null, {
            status: 200,
            headers: {
                'x-discogs-ratelimit-remaining': '0',
                'x-ratelimit-reset': String(resetIn10s),
            },
        });

        const backoffMs = applyRateLimitHeaders(response, limiter, 'discogs');

        assert.ok(
            backoffMs >= 9_000 && backoffMs < 11_000,
            `backoff should be ~10s, got ${backoffMs}`,
        );
        const delta = limiter.backoffUntil - before;
        assert.ok(
            delta >= 9_000 && delta < 11_000,
            `backoffUntil delta should be ~10s, got ${delta}`,
        );
    });

    it('converts absolute x-ratelimit-reset epochs into a relative backoff (generic headers)', async () => {
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

        const backoffMs = applyRateLimitHeaders(response, limiter, 'discogs');

        assert.ok(
            backoffMs >= 9_000 && backoffMs < 11_000,
            `backoff should be ~10s, got ${backoffMs}`,
        );
    });

    it('ignores reset timestamps already in the past', async () => {
        const { RateLimiter, applyRateLimitHeaders } = await importRateLimiter();
        const limiter = new RateLimiter(1, 0);
        const resetInPast = Math.floor(Date.now() / 1000) - 60;
        const response = new Response(null, {
            status: 200,
            headers: {
                'x-discogs-ratelimit-remaining': '0',
                'x-ratelimit-reset': String(resetInPast),
            },
        });

        const backoffMs = applyRateLimitHeaders(response, limiter, 'discogs');

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
