/**
 * Verifies the shared (Dapr state) rate limiter against a real sidecar and Redis.
 *
 * The unit tests stub fetch, so they cannot prove the ETag compare-and-set
 * round-trip actually works. This script can, which makes it the check to run
 * before trusting a change to the limiter.
 *
 * Run inside the dev container:
 *
 *     npm run verify:rate-limit
 *
 * Exits non-zero if a check fails, so it is safe to use in a smoke-test step.
 */
import { rateLimitConfig } from '../src/config/runtimeConfig.js';
import { deleteStateValues, getStateEntry } from '../src/infrastructure/dapr/daprStateStore.js';
import { GlobalTokenBucket } from '../src/services/musicApi/globalTokenBucket.js';
import { getRateLimiter } from '../src/services/musicApi/rateLimiter.js';

const PROVIDER = 'musicbrainz';
const BUCKET_KEY = `rate_limit:${PROVIDER}`;
const REDIS_KEY = `${process.env.DAPR_APP_ID ?? 'pawify-api'}||${BUCKET_KEY}`;

type Check = { name: string; ok: boolean; detail: string };

const checks: Check[] = [];
const record = (name: string, ok: boolean, detail: string) => {
    checks.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A second, independent bucket instance. Mirrors what a second server would see:
 * its in-process mirror starts empty, so any pacing it observes must come from
 * shared state.
 */
const createInstance = () =>
    new GlobalTokenBucket({
        key: BUCKET_KEY,
        capacity: rateLimitConfig.musicbrainzBurst,
        refillPerSecond: rateLimitConfig.musicbrainzRefillPerSecond,
        staggerMs: rateLimitConfig.musicbrainzStaggerMs,
        maxWaitMs: 1000,
        stateStoreName: rateLimitConfig.stateStoreName,
        maxBackoffWaitMs: rateLimitConfig.maxBackoffWaitMs,
        fallback: { acquire: async () => () => {} },
    });

const resetBucket = async () => {
    await deleteStateValues([BUCKET_KEY], rateLimitConfig.stateStoreName);
};

const main = async () => {
    console.log(`bucket: ${BUCKET_KEY} (redis: ${REDIS_KEY})`);
    console.log(
        `config: burst=${rateLimitConfig.musicbrainzBurst} ` +
            `refill=${rateLimitConfig.musicbrainzRefillPerSecond}/s ` +
            `stagger=${rateLimitConfig.musicbrainzStaggerMs}ms\n`,
    );

    // --- Shared state reachable at all -------------------------------------
    await resetBucket();
    const empty = await getStateEntry(BUCKET_KEY, rateLimitConfig.stateStoreName);
    record(
        'Dapr state reachable',
        empty.value === null && empty.etag === undefined,
        'bucket key is empty after reset',
    );

    // --- Burst, stagger, and refill ---------------------------------------
    const limiter = getRateLimiter(PROVIDER);

    // Warm the Dapr connection. The first state round-trip costs ~30-40ms, which
    // would otherwise distort the measured spacing of the first two dispatches.
    await limiter.acquire();
    await resetBucket();

    const acquireCount = Math.max(rateLimitConfig.musicbrainzBurst, 1) + 1;
    const startedAt = Date.now();
    const offsets: number[] = [];

    for (let i = 0; i < acquireCount; i += 1) {
        await limiter.acquire();
        offsets.push(Date.now() - startedAt);
    }

    const burst = offsets.slice(0, rateLimitConfig.musicbrainzBurst);
    const afterBurst = offsets[rateLimitConfig.musicbrainzBurst]!;
    const burstSpan = burst[burst.length - 1]! - burst[0]!;
    const staggerFloor = Math.max(10, rateLimitConfig.musicbrainzStaggerMs - 25);

    record(
        `burst of ${rateLimitConfig.musicbrainzBurst} is not serialized`,
        burst[burst.length - 1]! < 1500,
        `offsets ${JSON.stringify(offsets)}`,
    );

    if (rateLimitConfig.musicbrainzStaggerMs > 0 && burst.length >= 3) {
        // Spacing is measured from the second dispatch onward: the first slot is
        // reserved at t=0, so its observed gap also carries the state round-trip
        // and says nothing about the stagger.
        const gaps = burst.slice(2).map((offset, index) => offset - burst[index + 1]!);
        record(
            `dispatches spaced by ~${rateLimitConfig.musicbrainzStaggerMs}ms`,
            gaps.every((gap) => gap >= staggerFloor),
            `gaps ${JSON.stringify(gaps)} (floor ${staggerFloor}ms)`,
        );

        const collisions = offsets.filter(
            (offset, index) => index > 0 && offset === offsets[index - 1],
        );
        record(
            'no two dispatches share a millisecond',
            collisions.length === 0,
            `${offsets.length} dispatches, ${collisions.length} collisions`,
        );
    }

    record(
        'refill paces the request after the burst',
        afterBurst >= 500,
        `request ${acquireCount} waited until ${afterBurst}ms (burst span ${burstSpan}ms)`,
    );

    // --- Shared state reflects the burst -----------------------------------
    const stateAfterBurst = await getStateEntry(BUCKET_KEY, rateLimitConfig.stateStoreName);
    record(
        'burst was written to shared state',
        stateAfterBurst.value !== null,
        stateAfterBurst.value ? `state ${stateAfterBurst.value}` : 'no state written',
    );

    // --- Backoff propagates between instances ------------------------------
    await resetBucket();
    createInstance().setBackoff(2000);
    // setBackoff publishes asynchronously; give the write time to land.
    await sleep(500);

    const freshInstance = createInstance();
    const backoffStartedAt = Date.now();
    await freshInstance.acquire();
    const backoffWait = Date.now() - backoffStartedAt;

    record(
        'backoff is honored by a fresh instance',
        backoffWait >= 1000,
        `waited ${backoffWait}ms (local mirror was ${freshInstance.backoffUntil === 0 ? 0 : 'set'})`,
    );

    // --- Compare-and-set rejects a stale write ----------------------------
    await resetBucket();
    const { saveStateValueIfMatch } = await import('../src/infrastructure/dapr/daprStateStore.js');

    // Establish the key, then read the ETag it now owns.
    await saveStateValueIfMatch(
        BUCKET_KEY,
        '{"tokens":5}',
        undefined,
        rateLimitConfig.stateStoreName,
    );
    const version1 = await getStateEntry(BUCKET_KEY, rateLimitConfig.stateStoreName);

    // A write carrying the current ETag must succeed and advance the version.
    const currentWrite = await saveStateValueIfMatch(
        BUCKET_KEY,
        '{"tokens":4}',
        version1.etag,
        rateLimitConfig.stateStoreName,
    );
    record('write with current ETag succeeds', currentWrite === true, `etag ${version1.etag}`);

    // The same ETag is now stale, which is what a lost race looks like.
    const staleWrite = await saveStateValueIfMatch(
        BUCKET_KEY,
        '{"tokens":3}',
        version1.etag,
        rateLimitConfig.stateStoreName,
    );
    const versionAfter = await getStateEntry(BUCKET_KEY, rateLimitConfig.stateStoreName);
    record(
        'stale ETag write is rejected',
        staleWrite === false,
        `stale write ${staleWrite ? 'was ACCEPTED' : 'rejected'}; stored=${versionAfter.value}`,
    );

    // Leave no test state behind.
    await resetBucket();

    const failed = checks.filter((check) => !check.ok);
    console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
    if (failed.length > 0) {
        console.error('failed:', failed.map((check) => check.name).join(', '));
        process.exit(1);
    }

    console.log(
        `\nInspect the bucket yourself:\n  docker compose --env-file .env.local -f docker-compose.yml -f docker-compose.dev.yml exec redis sh -c 'redis-cli -a "$REDIS_PASSWORD" --no-auth-warning HGETALL "${REDIS_KEY}"'`,
    );
};

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
