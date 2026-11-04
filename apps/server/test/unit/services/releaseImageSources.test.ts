import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

// Provider clients acquire shared token buckets. With no reachable Dapr state they
// fall back to a local limiter whose default 1s delay would dominate these tests,
// so the fallback delay is collapsed before the limiter module is first imported.
process.env.DAPR_HTTP_ENDPOINT = 'http://dapr.test:3500';
process.env.RATE_LIMIT_FALLBACK_DELAY_MS = '1';
process.env.RATE_LIMIT_DEEZER_BURST = '1000';
process.env.RATE_LIMIT_DEEZER_REFILL_PER_SECOND = '1000';
process.env.RATE_LIMIT_DEEZER_STAGGER_MS = '0';
process.env.TIDAL_API_TOKEN = 'test-token';
process.env.TIDAL_COUNTRY_CODE = 'US';

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

type Call = { url: string; method: string };

const stubFetch = (handler: (call: Call) => Response | Promise<Response>) => {
    const calls: Call[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const call = { url, method: init?.method ?? 'GET' };
        calls.push(call);
        return await handler(call);
    }) as typeof fetch;
    return calls;
};

const secretsResponse = (): Response => new Response(null, { status: 404 });

const jsonResponse = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });

const emptyResponse = (status: number): Response =>
    new Response(null, { status });

afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
});

const importChain = async () =>
    await import('../../../src/services/musicApi/releaseImageSources.js');

const deezerAlbum = (id: number, coverXl: string) => ({
    id,
    title: 'Album',
    cover_xl: coverXl,
});

describe('resolveReleaseImage provider chain', () => {
    it('prefers Deezer over Tidal and Cover Art Archive', async () => {
        const calls = stubFetch((call) => {
            if (call.url.includes('/invoke/deezer/')) {
                return jsonResponse(
                    deezerAlbum(
                        1,
                        'https://cdn-images.dzcdn.net/images/cover/abc123/1000x1000-000000-80-0-0.jpg',
                    ),
                );
            }
            throw new Error(`unexpected call ${call.url}`);
        });
        const { resolveReleaseImage } = await importChain();

        const result = await resolveReleaseImage({
            deezerUrls: ['https://www.deezer.com/album/1'],
            tidalUrls: ['https://tidal.com/album/2'],
            releaseId: 'release-1',
        });

        assert.equal(result.source, 'deezer');
        assert.deepEqual(result.confirmedMisses, []);
        assert.deepEqual(result.transientFailures, []);
        assert.equal(
            calls.filter((call) => call.url.includes('/invoke/deezer/')).length,
            1,
        );
    });

    it('falls through to Tidal when Deezer has no artwork', async () => {
        const calls = stubFetch((call) => {
            if (call.url.includes('/invoke/deezer/')) {
                return jsonResponse({
                    id: 1,
                    cover_xl:
                        'https://cdn-images.dzcdn.net/images/cover/d41d8cd98f00b204e9800998ecf8427e/1000x1000-000000-80-0-0.jpg',
                });
            }
            if (call.url.includes('/v1.0/secrets/')) {
                return secretsResponse();
            }
            if (call.url.includes('/invoke/tidal/') && call.url.includes('/albums/2')) {
                return jsonResponse({ id: 2, cover: 'aaaa-bbbb-cccc-dddd' });
            }
            if (call.url.includes('/invoke/tidalimages/')) {
                return emptyResponse(200);
            }
            throw new Error(`unexpected call ${call.url}`);
        });
        const { resolveReleaseImage } = await importChain();

        const result = await resolveReleaseImage({
            deezerUrls: ['https://www.deezer.com/album/1'],
            tidalUrls: ['https://tidal.com/album/2'],
            releaseId: 'release-1',
        });

        assert.equal(result.source, 'tidal');
        assert.ok(result.image?.includes('resources.tidal.com'));
        assert.ok(calls.some((call) => call.url.includes('/invoke/tidal/') && call.url.includes('/albums/2')));
    });

    it('falls through to Cover Art Archive when no provider has artwork', async () => {
        const calls = stubFetch((call) => {
            if (call.url.includes('/invoke/deezer/')) {
                return jsonResponse({ id: 1, cover_xl: 'https://cdn-images.dzcdn.net/images/cover//500x500.jpg' });
            }
            if (call.url.includes('/invoke/coverartarchive/')) {
                return emptyResponse(200);
            }
            throw new Error(`unexpected call ${call.url}`);
        });
        const { resolveReleaseImage } = await importChain();

        const result = await resolveReleaseImage({
            deezerUrls: ['https://www.deezer.com/album/1'],
            releaseGroupId: 'group-1',
        });

        assert.equal(result.source, 'coverartarchive');
        assert.ok(calls.some((call) => call.url.includes('/invoke/coverartarchive/') && call.url.includes('/release-group/group-1/front')));
    });

    it('reports a confirmed miss when every provider says there is no artwork', async () => {
        stubFetch((call) => {
            if (call.url.includes('/invoke/coverartarchive/')) {
                return emptyResponse(404);
            }
            throw new Error(`unexpected call ${call.url}`);
        });
        const { resolveReleaseImage } = await importChain();

        const result = await resolveReleaseImage({ releaseId: 'release-1' });

        assert.equal(result.image, null);
        assert.equal(result.source, undefined);
        assert.deepEqual(result.confirmedMisses, ['coverartarchive']);
    });

    it('reports a transient failure when a provider is unreachable', async () => {
        stubFetch((call) => {
            if (call.url.includes('/invoke/deezer/')) {
                return emptyResponse(503);
            }
            if (call.url.includes('/invoke/coverartarchive/')) {
                return emptyResponse(404);
            }
            throw new Error(`unexpected call ${call.url}`);
        });
        const { resolveReleaseImage } = await importChain();

        const result = await resolveReleaseImage({
            deezerUrls: ['https://www.deezer.com/album/1'],
            releaseId: 'release-1',
        });

        // Deezer failed transiently, CAA had nothing: overall transient, so the
        // caller retries later instead of caching "no artwork" for a week.
        assert.equal(result.image, undefined);
        assert.deepEqual(result.transientFailures, ['deezer']);
        assert.deepEqual(result.confirmedMisses, ['coverartarchive']);
    });

    it('skips providers with no urls instead of calling them', async () => {
        const calls = stubFetch((call) => {
            if (call.url.includes('/invoke/coverartarchive/')) {
                return emptyResponse(404);
            }
            throw new Error(`unexpected call ${call.url}`);
        });
        const { resolveReleaseImage } = await importChain();

        await resolveReleaseImage({ releaseId: 'release-1' });

        assert.equal(calls.every((call) => call.url.includes('/invoke/coverartarchive/')), true);
    });
});
