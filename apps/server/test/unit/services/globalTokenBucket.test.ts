import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

import { GlobalTokenBucket } from '../../../src/services/musicApi/globalTokenBucket.js';

process.env.DAPR_HTTP_ENDPOINT = 'http://dapr.test';

type BucketState = {
    tokens: number;
    lastRefillAt: number;
    nextSlotAt: number;
    backoffUntil: number;
    lastDispatchAt?: number;
};

type StubOptions = {
    /** Answer state reads with HTTP 500, simulating an unreachable store. */
    failReads?: boolean;
    /** Reject this many writes with 409 before letting one through. */
    conflictsBeforeSuccess?: number;
    /** Seed the stored bucket. */
    initial?: BucketState;
};

const originalFetch = globalThis.fetch;

/**
 * Minimal Dapr state store with ETag compare-and-set semantics.
 *
 * The bucket's atomicity depends entirely on a losing write being rejected, so
 * the stub has to model that rather than just storing whatever it is handed.
 */
const installStateStore = (options: StubOptions = {}) => {
    const store = new Map<string, { value: string; etag: string }>();
    let counter = 0;
    const conflicts = { forced: 0, observed: 0 };

    if (options.initial) {
        counter += 1;
        store.set('rate_limit:test', {
            value: JSON.stringify(options.initial),
            etag: `init-${counter}`,
        });
    }

    const forcedConflicts = options.conflictsBeforeSuccess ?? 0;
    const keyFromPath = (path: string): string | null => {
        const match = /^\/v1\.0\/state\/[^/]+\/(.+)$/.exec(path);
        return match ? decodeURIComponent(match[1]!) : null;
    };

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const path = new URL(String(input), 'http://dapr.test').pathname;
        const method = (init?.method ?? 'GET').toUpperCase();

        if (method === 'GET') {
            if (options.failReads) {
                return new Response('state store unavailable', { status: 500 });
            }

            const key = keyFromPath(path);
            if (!key) {
                throw new Error(`unexpected GET ${path}`);
            }

            const entry = store.get(key);
            if (!entry) {
                return new Response(null, { status: 204 });
            }

            return new Response(entry.value, {
                status: 200,
                headers: { etag: `"${entry.etag}"` },
            });
        }

        if (method === 'POST') {
            if (conflicts.forced < forcedConflicts) {
                conflicts.forced += 1;
                conflicts.observed += 1;
                return new Response(null, { status: 409 });
            }

            const items = JSON.parse(String(init?.body ?? '[]')) as Array<{
                key: string;
                value: string;
                etag?: string;
            }>;
            const item = items[0]!;
            const existing = store.get(item.key);

            if (typeof item.etag === 'string' && existing?.etag !== item.etag) {
                conflicts.observed += 1;
                return new Response(null, { status: 409 });
            }

            counter += 1;
            store.set(item.key, { value: item.value, etag: `write-${counter}` });
            return new Response(null, { status: 204 });
        }

        throw new Error(`unexpected ${method} ${path}`);
    }) as typeof fetch;

    return { store, conflicts };
};

const storedBucket = (store: Map<string, { value: string }>): BucketState => {
    const entry = store.get('rate_limit:test');
    assert.ok(entry, 'expected bucket state to exist');
    return JSON.parse(entry.value) as BucketState;
};

const makeBucket = (
    overrides: Partial<ConstructorParameters<typeof GlobalTokenBucket>[0]> = {},
) => {
    const fallbackCalls = { count: 0 };
    const bucket = new GlobalTokenBucket({
        key: 'rate_limit:test',
        capacity: 5,
        refillPerSecond: 1,
        staggerMs: 0,
        maxWaitMs: 1000,
        maxBackoffWaitMs: 30_000,
        fallback: {
            acquire: async () => {
                fallbackCalls.count += 1;
                return () => {};
            },
        },
        ...overrides,
    });

    return { bucket, fallbackCalls };
};

afterEach(() => {
    globalThis.fetch = originalFetch;
});

describe('GlobalTokenBucket', () => {
    it('allows a burst up to capacity without waiting', async () => {
        installStateStore();
        const { bucket } = makeBucket({ capacity: 3, refillPerSecond: 1, staggerMs: 0 });

        const startedAt = Date.now();
        for (let i = 0; i < 3; i += 1) {
            await bucket.acquire();
        }
        const elapsed = Date.now() - startedAt;

        // Serialized at 1/sec this would take 2 seconds; a burst must not.
        assert.ok(elapsed < 150, `burst took ${elapsed}ms, expected it not to wait`);
    });

    it('waits for a refill once the burst budget is spent', async () => {
        installStateStore();
        // 20 tokens/sec => one token every 50ms.
        const { bucket } = makeBucket({ capacity: 1, refillPerSecond: 20, staggerMs: 0 });

        await bucket.acquire();
        const startedAt = Date.now();
        await bucket.acquire();
        const elapsed = Date.now() - startedAt;

        assert.ok(elapsed >= 30, `expected to wait for a refill, waited ${elapsed}ms`);
        assert.ok(elapsed < 600, `waited ${elapsed}ms, expected roughly one refill period`);
    });

    it('spaces burst dispatches by staggerMs', async () => {
        installStateStore();
        // Refill is fast enough to never be the constraint, so only the stagger
        // can pace the requests.
        const { bucket } = makeBucket({ capacity: 5, refillPerSecond: 1000, staggerMs: 60 });

        const completions: number[] = [];
        for (let i = 0; i < 3; i += 1) {
            await bucket.acquire();
            completions.push(Date.now());
        }

        const firstGap = completions[1]! - completions[0]!;
        const secondGap = completions[2]! - completions[1]!;

        assert.ok(firstGap >= 45, `first dispatch gap was ${firstGap}ms, expected >= 45ms`);
        assert.ok(secondGap >= 45, `second dispatch gap was ${secondGap}ms, expected >= 45ms`);
    });

    it('shares one budget between instances, so a second server cannot double the rate', async () => {
        installStateStore();
        const config = { capacity: 1, refillPerSecond: 0.2, staggerMs: 0, maxWaitMs: 100 };

        const { bucket: serverA } = makeBucket(config);
        const { bucket: serverB } = makeBucket(config);

        await serverA.acquire();

        // Server B must see server A's token as already spent.
        const controller = new AbortController();
        const blocked = serverB
            .acquire(controller.signal)
            .then(() => 'acquired')
            .catch(() => 'aborted');

        const outcome = await Promise.race([blocked, delay(150).then(() => 'blocked')]);
        controller.abort();

        assert.equal(outcome, 'blocked', 'second instance should not have obtained a token');
        assert.equal(await blocked, 'aborted');
    });

    it('does not double-spend a token when a compare-and-set loses the race', async () => {
        const { store, conflicts } = installStateStore({ conflictsBeforeSuccess: 1 });
        const { bucket } = makeBucket({ capacity: 5, refillPerSecond: 1 });

        await bucket.acquire();

        assert.equal(conflicts.forced, 1, 'expected one forced conflict');
        // The rejected write must not have decremented the bucket, and the retry
        // must consume exactly one token.
        assert.equal(storedBucket(store).tokens, 4);
    });

    it('honors a backoff written by another instance', async () => {
        const now = Date.now();
        installStateStore({
            initial: {
                tokens: 5,
                lastRefillAt: now,
                nextSlotAt: now,
                backoffUntil: now + 250,
            },
        });
        const { bucket } = makeBucket({ capacity: 5, refillPerSecond: 1, maxWaitMs: 500 });

        const startedAt = Date.now();
        await bucket.acquire();
        const elapsed = Date.now() - startedAt;

        assert.ok(elapsed >= 200, `expected to respect shared backoff, waited ${elapsed}ms`);
    });

    it('publishes a backoff so every instance pauses', async () => {
        const { store } = installStateStore();
        const { bucket } = makeBucket({ capacity: 5, refillPerSecond: 1 });

        bucket.setBackoff(300);
        // setBackoff is synchronous by contract; the shared write is fire-and-forget.
        await delay(50);

        assert.ok(
            storedBucket(store).backoffUntil >= Date.now() + 150,
            'expected the backoff deadline to reach shared state',
        );
    });

    it('fails fast instead of holding the batch for a very long pause', async () => {
        const now = Date.now();
        installStateStore({
            initial: {
                tokens: 5,
                lastRefillAt: now,
                nextSlotAt: now,
                // Further out than the configured cap.
                backoffUntil: now + 120_000,
                lastDispatchAt: now,
            },
        });
        const { bucket } = makeBucket({
            capacity: 5,
            refillPerSecond: 1,
            maxBackoffWaitMs: 30_000,
        });

        const startedAt = Date.now();
        await assert.rejects(
            bucket.acquire(),
            (error: Error) => error.name === 'RateLimitUnavailableError',
        );
        assert.ok(Date.now() - startedAt < 1000, 'must not wait for the pause');
    });

    it('still waits out a pause that is within the cap', async () => {
        const now = Date.now();
        installStateStore({
            initial: {
                tokens: 5,
                lastRefillAt: now,
                nextSlotAt: now,
                backoffUntil: now + 250,
                lastDispatchAt: now,
            },
        });
        const { bucket } = makeBucket({
            capacity: 5,
            refillPerSecond: 1,
            maxBackoffWaitMs: 30_000,
        });

        const startedAt = Date.now();
        await bucket.acquire();
        assert.ok(Date.now() - startedAt >= 200, 'expected to wait out the short pause');
    });

    it('shares the last dispatch time so documented windows can be measured', async () => {
        const { store } = installStateStore();
        const { bucket } = makeBucket({ capacity: 5, refillPerSecond: 1 });

        await bucket.acquire();

        const persisted = storedBucket(store).lastDispatchAt ?? 0;
        assert.ok(persisted > 0, 'expected lastDispatchAt to be persisted');
        assert.equal(bucket.lastDispatchAt, persisted);
    });

    it('falls back to local limiting when shared state is unreachable', async () => {
        installStateStore({ failReads: true });
        const { bucket, fallbackCalls } = makeBucket({ capacity: 5, refillPerSecond: 1 });

        const release = await bucket.acquire();

        assert.equal(fallbackCalls.count, 1);
        assert.equal(typeof release, 'function');
        release();
    });

    it('rejects instead of hanging when the caller aborts while waiting', async () => {
        installStateStore();
        const { bucket } = makeBucket({
            capacity: 1,
            refillPerSecond: 0.1,
            staggerMs: 0,
            maxWaitMs: 100,
        });

        await bucket.acquire();

        const controller = new AbortController();
        const pending = bucket.acquire(controller.signal);
        controller.abort();

        await assert.rejects(pending, (error: Error) => error.name === 'AbortError');
    });

    it('returns a release function so existing call sites stay unchanged', async () => {
        installStateStore();
        const { bucket } = makeBucket({ capacity: 5 });

        const release = await bucket.acquire();

        assert.equal(typeof release, 'function');
        // No-op by design: a consumed token is not returned to the bucket.
        release();
    });
});
