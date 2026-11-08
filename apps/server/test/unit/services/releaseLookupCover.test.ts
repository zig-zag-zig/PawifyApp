import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { closeMusicDb } from '../../../src/infrastructure/musicDb/musicDbClient.js';

// See releaseCoverProviderFallback: collapse the local fallback limiter delay so the
// provider chain does not sleep a second per request in tests.
process.env.DAPR_HTTP_ENDPOINT = 'http://dapr.test:3500';
process.env.RATE_LIMIT_FALLBACK_DELAY_MS = '1';
process.env.RATE_LIMIT_MUSICBRAINZ_BURST = '1000';
process.env.RATE_LIMIT_MUSICBRAINZ_REFILL_PER_SECOND = '1000';
process.env.RATE_LIMIT_MUSICBRAINZ_STAGGER_MS = '0';
process.env.RATE_LIMIT_DEEZER_BURST = '1000';
process.env.RATE_LIMIT_DEEZER_REFILL_PER_SECOND = '1000';
process.env.RATE_LIMIT_DEEZER_STAGGER_MS = '0';
process.env.TIDAL_API_TOKEN = 'test-token';
process.env.TIDAL_COUNTRY_CODE = 'US';

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
    closeMusicDb();
});

const RELEASE_ID = 'd7ffee2f-c783-4bfd-8f7c-7492675fc71f';
const GROUP_ID = 'e06540ef-1343-4c6d-982c-ed33339bbef8';
const DEEZER_ALBUM = 'https://www.deezer.com/album/1110718732';
const DEEZER_COVER =
    'https://cdn-images.dzcdn.net/images/cover/41fa7c11c9dbd52991c80b1a534403da/1000x1000-000000-80-0-0.jpg';

/** The real MusicBrainz payload for the reported single, trimmed to what the mapper reads. */
const apiReleasePayload = (includeDeezerRelation: boolean) => ({
    id: RELEASE_ID,
    title: 'No Competition',
    date: '2026-10-04',
    disambiguation: '',
    country: 'XW',
    'release-group': {
        id: GROUP_ID,
        title: 'No Competition',
        'primary-type': 'Single',
        'first-release-date': '2026-10-04',
        disambiguation: '',
    },
    'artist-credit': [
        {
            name: 'CZARFACE',
            joinphrase: '',
            artist: {
                id: '66120159-5fe7-4cdb-8c9a-7ac68e393c6f',
                name: 'Czarface',
                'sort-name': 'Czarface',
                disambiguation: '',
            },
        },
    ],
    relations: includeDeezerRelation
        ? [{ type: 'free streaming', url: { resource: DEEZER_ALBUM } }]
        : [],
    media: [],
    'cover-art-archive': { artwork: false, count: 0 },
});

const installApiStubs = (includeDeezerRelation: boolean): Call[] =>
    stubFetch((call) => {
        if (call.url.includes(`/ws/2/release/${RELEASE_ID}`)) {
            return jsonResponse(apiReleasePayload(includeDeezerRelation));
        }
        if (call.url.includes('/invoke/deezer/')) {
            return jsonResponse({ id: 1110718732, cover_xl: DEEZER_COVER });
        }
        if (call.url.includes('/v1.0/state/')) {
            return new Response(null, { status: 404 });
        }
        throw new Error(`unexpected call ${call.url}`);
    });

describe('getRelease cover resolution', () => {
    it('uses the url-rels of the API response instead of waiting for a mirror sync', async () => {
        const calls = installApiStubs(true);
        const { getRelease } = await import('../../../src/services/musicbrainz/releaseLookup.js');

        const release = await getRelease(RELEASE_ID);

        assert.ok(release);
        assert.equal(release.cover_url, DEEZER_COVER);

        const coverArtCalls = calls.filter((call) => call.url.includes('/invoke/coverartarchive/'));
        assert.equal(coverArtCalls.length, 0);
    });

    it('falls back to Cover Art Archive when the release has no streaming links', async () => {
        const calls = stubFetch((call) => {
            if (call.url.includes(`/ws/2/release/${RELEASE_ID}`)) {
                return jsonResponse(apiReleasePayload(false));
            }
            if (call.url.includes('/invoke/coverartarchive/')) {
                return new Response(null, { status: 404 });
            }
            if (call.url.includes('/v1.0/state/')) {
                return new Response(null, { status: 404 });
            }
            throw new Error(`unexpected call ${call.url}`);
        });
        const { getRelease } = await import('../../../src/services/musicbrainz/releaseLookup.js');

        const release = await getRelease(RELEASE_ID);

        assert.ok(release);
        assert.equal(release.cover_url, null);
        assert.ok(calls.some((call) => call.url.includes('/invoke/coverartarchive/')));
    });
});
