import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

process.env.RATE_LIMIT_DEEZER_BURST = '10';
process.env.RATE_LIMIT_FALLBACK_DELAY_MS = '1';

afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
});

describe('deezer quota pause', () => {
    it('stops calling Deezer while the bucket is paused, so fallbacks run immediately', async () => {
        let deezerCalls = 0;
        globalThis.fetch = (async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes('/invoke/deezer/')) {
                deezerCalls += 1;
                // Quota error: HTTP 200 with code 4, exactly what Deezer returns.
                return new Response(JSON.stringify({ error: { code: 4, type: 'Exception' } }), {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                });
            }
            return new Response(null, { status: 404 });
        }) as typeof fetch;

        const { getDeezerAlbumImage } = await import('../../../src/services/musicApi/deezerClient.js');

        // First lookup trips the quota and pauses the provider for 5s.
        assert.equal(await getDeezerAlbumImage(['https://www.deezer.com/album/1']), undefined);
        assert.equal(deezerCalls, 1);

        // Every lookup inside the pause must fail fast instead of waiting 5s each.
        const started = Date.now();
        for (let index = 0; index < 5; index += 1) {
            assert.equal(
                await getDeezerAlbumImage([`https://www.deezer.com/album/${index + 2}`]),
                undefined,
            );
        }

        assert.equal(deezerCalls, 1, 'no Deezer requests may be issued while paused');
        assert.ok(Date.now() - started < 500, 'paused lookups must not block on the backoff');
    });
});
