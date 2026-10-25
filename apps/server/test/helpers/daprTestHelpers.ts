import { afterEach } from 'node:test';

process.env.DAPR_HTTP_ENDPOINT = 'http://dapr.test';
process.env.MUSICBRAINZ_DELAY_MS = '1';
process.env.NOTIFY_NEW_RELEASES_LOCK_TTL_MS = '3600001';

const originalFetch = globalThis.fetch;

/**
 * In-memory stand-in for the shared token buckets.
 *
 * The rate limiter persists bucket state through Dapr state, so every provider
 * call now also performs a state read and a compare-and-set write. Handling that
 * here keeps provider tests asserting on provider traffic, without every test
 * needing to know about bucket internals.
 *
 * Only `rate_limit:` keys are intercepted: tests that exercise the state store
 * itself use their own key namespaces and still see their calls.
 */
const RATE_LIMIT_KEY_PREFIX = 'rate_limit:';

type RateLimitEntry = { value: string; etag: string };

const rateLimitState = new Map<string, RateLimitEntry>();
let etagCounter = 0;

export const clearRateLimitState = (): void => {
    rateLimitState.clear();
    etagCounter = 0;
};

/** Seeds bucket state directly, for tests that need a specific starting bucket. */
export const setRateLimitState = (key: string, value: unknown): void => {
    etagCounter += 1;
    rateLimitState.set(key, { value: JSON.stringify(value), etag: `seed-${etagCounter}` });
};

export const getRateLimitState = (key: string): unknown => {
    const entry = rateLimitState.get(key);
    return entry ? (JSON.parse(entry.value) as unknown) : undefined;
};

const handleRateLimitState = (url: string, init: RequestInit): Response | null => {
    const path = new URL(url, 'http://dapr.test').pathname;
    const method = (init.method ?? 'GET').toUpperCase();

    if (method === 'GET' || method === 'HEAD') {
        const keyMatch = /^\/v1\.0\/state\/[^/]+\/(.+)$/.exec(path);
        if (!keyMatch) {
            return null;
        }

        const key = decodeURIComponent(keyMatch[1]!);
        if (!key.startsWith(RATE_LIMIT_KEY_PREFIX)) {
            return null;
        }

        const entry = rateLimitState.get(key);
        if (!entry) {
            return new Response(null, { status: 204 });
        }

        return new Response(entry.value, {
            status: 200,
            headers: { etag: `"${entry.etag}"` },
        });
    }

    if (method === 'POST') {
        if (!/^\/v1\.0\/state\/[^/]+$/.test(path)) {
            return null;
        }

        const items = JSON.parse(String(init.body ?? '[]')) as Array<{
            key?: unknown;
            value?: unknown;
            etag?: unknown;
        }>;

        const isBucketWrite =
            items.length > 0 &&
            items.every(
                (item) =>
                    typeof item.key === 'string' && item.key.startsWith(RATE_LIMIT_KEY_PREFIX),
            );

        if (!isBucketWrite) {
            return null;
        }

        for (const item of items) {
            const key = item.key as string;
            const existing = rateLimitState.get(key);

            if (typeof item.etag === 'string' && existing?.etag !== item.etag) {
                // Stale ETag: another writer changed the bucket first.
                return new Response(null, { status: 409 });
            }

            etagCounter += 1;
            rateLimitState.set(key, { value: String(item.value), etag: `cas-${etagCounter}` });
        }

        return new Response(null, { status: 204 });
    }

    return null;
};

export const installFetch = (
    handler: (url: string, init: RequestInit) => Promise<Response> | Response,
): void => {
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const requestInit = init ?? {};
        const bucketResponse = handleRateLimitState(url, requestInit);
        if (bucketResponse) {
            return bucketResponse;
        }

        return await handler(url, requestInit);
    }) as typeof fetch;
};

afterEach(() => {
    globalThis.fetch = originalFetch;
    clearRateLimitState();
});
