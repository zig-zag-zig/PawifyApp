import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

// The provider chain acquires shared token buckets. With no reachable Dapr state the
// local fallback limiter's 1s delay would dominate these tests, so it is collapsed
// before the limiter module is first imported.
process.env.DAPR_HTTP_ENDPOINT = 'http://dapr.test:3500';
process.env.RATE_LIMIT_FALLBACK_DELAY_MS = '1';
process.env.RATE_LIMIT_MUSICBRAINZ_BURST = '1000';
process.env.RATE_LIMIT_MUSICBRAINZ_REFILL_PER_SECOND = '1000';
process.env.RATE_LIMIT_MUSICBRAINZ_STAGGER_MS = '0';

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

type Call = { url: string; method: string };

const stubFetch = (handler: (call: Call) => Response | Promise<Response>): Call[] => {
    const calls: Call[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const call = { url, method: init?.method ?? 'GET' };
        calls.push(call);
        return await handler(call);
    }) as typeof fetch;
    return calls;
};

const jsonResponse = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });

afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
});

const GROUP_ID = 'e06540ef-1343-4c6d-982c-ed33339bbef8';
const RELEASE_ID = 'd7ffee2f-c783-4bfd-8f7c-7492675fc71f';
const DEEZER_ALBUM = 'https://www.deezer.com/album/1110718732';
const TIDAL_ALBUM = 'https://tidal.com/album/566586812';

const musicBrainzCall = (calls: Call[]) =>
    calls.filter((call) => call.url.includes('/invoke/musicbrainz/'));

describe('providerUrlsFromLinks', () => {
    it('classifies Deezer and Tidal links and ignores everything else', async () => {
        const { providerUrlsFromLinks } =
            await import('../../../src/services/coverArt/providerLinks.js');

        const urls = providerUrlsFromLinks([
            { service: 'spotify', url: 'https://open.spotify.com/album/x' },
            { service: 'deezer', url: DEEZER_ALBUM },
            { service: 'tidal', url: TIDAL_ALBUM },
            { service: 'deezer', url: DEEZER_ALBUM },
        ]);

        assert.deepEqual(urls, { deezerUrls: [DEEZER_ALBUM], tidalUrls: [TIDAL_ALBUM] });
    });

    it('falls back to the host when a relation was not classified', async () => {
        const { providerUrlsFromLinks } =
            await import('../../../src/services/coverArt/providerLinks.js');

        const urls = providerUrlsFromLinks([
            { service: 'official', url: 'https://www.deezer.com/album/42' },
            { service: 'official', url: 'https://listen.tidal.com/album/43' },
        ]);

        assert.deepEqual(urls, {
            deezerUrls: ['https://www.deezer.com/album/42'],
            tidalUrls: ['https://listen.tidal.com/album/43'],
        });
    });

    it('returns empty buckets for undefined links', async () => {
        const { providerUrlsFromLinks } =
            await import('../../../src/services/coverArt/providerLinks.js');

        assert.deepEqual(providerUrlsFromLinks(undefined), { deezerUrls: [], tidalUrls: [] });
    });
});

describe('getReleaseGroupLinksFromApi', () => {
    beforeEach(async () => {
        const { resetProviderLinkCachesForTests } =
            await import('../../../src/services/coverArt/providerLinks.js');
        resetProviderLinkCachesForTests();
    });

    it('probes the group first and falls back to its releases for provider links', async () => {
        const calls = stubFetch((call) => {
            if (call.url.includes(`/ws/2/release-group/${GROUP_ID}`)) {
                // The real Czarface single: the group has no url-rels at all.
                return jsonResponse({
                    id: GROUP_ID,
                    relations: [],
                    releases: [{ id: RELEASE_ID }],
                });
            }
            if (call.url.includes(`/ws/2/release/${RELEASE_ID}`)) {
                return jsonResponse({
                    id: RELEASE_ID,
                    relations: [
                        { url: { resource: 'https://open.spotify.com/album/x' } },
                        { url: { resource: DEEZER_ALBUM } },
                        { url: { resource: TIDAL_ALBUM } },
                    ],
                });
            }
            throw new Error(`unexpected call ${call.url}`);
        });

        const { getReleaseGroupLinksFromApi } =
            await import('../../../src/services/coverArt/providerLinks.js');
        const links = await getReleaseGroupLinksFromApi(GROUP_ID);

        assert.deepEqual(links, {
            deezerUrls: [DEEZER_ALBUM],
            tidalUrls: [TIDAL_ALBUM],
            releaseIds: [RELEASE_ID],
        });
        assert.equal(musicBrainzCall(calls).length, 2);
    });

    it('does not probe the group releases when the group itself has provider links', async () => {
        const calls = stubFetch((call) => {
            if (call.url.includes(`/ws/2/release-group/${GROUP_ID}`)) {
                return jsonResponse({
                    id: GROUP_ID,
                    relations: [{ url: { resource: DEEZER_ALBUM } }],
                    releases: [{ id: RELEASE_ID }],
                });
            }
            throw new Error(`unexpected call ${call.url}`);
        });

        const { getReleaseGroupLinksFromApi } =
            await import('../../../src/services/coverArt/providerLinks.js');
        const links = await getReleaseGroupLinksFromApi(GROUP_ID);

        assert.deepEqual(links.deezerUrls, [DEEZER_ALBUM]);
        assert.equal(musicBrainzCall(calls).length, 1);
    });

    it('caches the answer so a repeated page load costs no requests', async () => {
        const calls = stubFetch((call) => {
            if (call.url.includes(`/ws/2/release-group/${GROUP_ID}`)) {
                return jsonResponse({
                    id: GROUP_ID,
                    relations: [],
                    releases: [{ id: RELEASE_ID }],
                });
            }
            if (call.url.includes(`/ws/2/release/${RELEASE_ID}`)) {
                return jsonResponse({
                    id: RELEASE_ID,
                    relations: [{ url: { resource: DEEZER_ALBUM } }],
                });
            }
            throw new Error(`unexpected call ${call.url}`);
        });

        const { getReleaseGroupLinksFromApi } =
            await import('../../../src/services/coverArt/providerLinks.js');
        await getReleaseGroupLinksFromApi(GROUP_ID);
        const before = musicBrainzCall(calls).length;
        const second = await getReleaseGroupLinksFromApi(GROUP_ID);

        assert.equal(musicBrainzCall(calls).length, before);
        assert.deepEqual(second.deezerUrls, [DEEZER_ALBUM]);
    });

    it('does not cache a transient API failure as a confirmed miss', async () => {
        let failNext = true;
        const calls = stubFetch((call) => {
            if (call.url.includes(`/ws/2/release-group/${GROUP_ID}`)) {
                if (failNext) {
                    return new Response(null, { status: 503 });
                }
                return jsonResponse({
                    id: GROUP_ID,
                    relations: [{ url: { resource: DEEZER_ALBUM } }],
                    releases: [],
                });
            }
            throw new Error(`unexpected call ${call.url}`);
        });

        const { getReleaseGroupLinksFromApi } =
            await import('../../../src/services/coverArt/providerLinks.js');

        const failed = await getReleaseGroupLinksFromApi(GROUP_ID);
        assert.deepEqual(failed, { deezerUrls: [], tidalUrls: [], releaseIds: [] });

        // The failure must not be remembered: the next attempt asks again and succeeds.
        failNext = false;
        const retried = await getReleaseGroupLinksFromApi(GROUP_ID);
        assert.deepEqual(retried.deezerUrls, [DEEZER_ALBUM]);
        assert.equal(musicBrainzCall(calls).length, 2);
    });

    it('degrades to no links when the API answers with an error', async () => {
        stubFetch(() => new Response(null, { status: 503 }));

        const { getReleaseGroupLinksFromApi } =
            await import('../../../src/services/coverArt/providerLinks.js');
        const links = await getReleaseGroupLinksFromApi(GROUP_ID);

        assert.deepEqual(links, { deezerUrls: [], tidalUrls: [], releaseIds: [] });
    });
});
describe('getReleaseLinksFromApi', () => {
    beforeEach(async () => {
        const { resetProviderLinkCachesForTests } =
            await import('../../../src/services/coverArt/providerLinks.js');
        resetProviderLinkCachesForTests();
    });

    it('caches a confirmed empty answer instead of re-probing the API', async () => {
        // A release that genuinely has no streaming relations still answered: the
        // empty result is a fact, and re-asking on every page load costs one
        // rate-limited MusicBrainz request per load for the same nothing.
        const calls = stubFetch((call) => {
            if (call.url.includes(`/ws/2/release/${RELEASE_ID}`)) {
                return jsonResponse({ id: RELEASE_ID, relations: [] });
            }
            throw new Error(`unexpected call ${call.url}`);
        });

        const { getReleaseLinksFromApi } =
            await import('../../../src/services/coverArt/providerLinks.js');

        const first = await getReleaseLinksFromApi(RELEASE_ID);
        const second = await getReleaseLinksFromApi(RELEASE_ID);

        assert.deepEqual(first, { deezerUrls: [], tidalUrls: [] });
        assert.deepEqual(second, { deezerUrls: [], tidalUrls: [] });
        assert.equal(musicBrainzCall(calls).length, 1);
    });

    it('does not cache a transient API failure', async () => {
        let failNext = true;
        const calls = stubFetch((call) => {
            if (call.url.includes(`/ws/2/release/${RELEASE_ID}`)) {
                if (failNext) {
                    return new Response(null, { status: 503 });
                }
                return jsonResponse({
                    id: RELEASE_ID,
                    relations: [{ url: { resource: DEEZER_ALBUM } }],
                });
            }
            throw new Error(`unexpected call ${call.url}`);
        });

        const { getReleaseLinksFromApi } =
            await import('../../../src/services/coverArt/providerLinks.js');

        assert.deepEqual(await getReleaseLinksFromApi(RELEASE_ID), {
            deezerUrls: [],
            tidalUrls: [],
        });

        failNext = false;
        const retried = await getReleaseLinksFromApi(RELEASE_ID);

        assert.deepEqual(retried.deezerUrls, [DEEZER_ALBUM]);
        assert.equal(musicBrainzCall(calls).length, 2);
    });
});
