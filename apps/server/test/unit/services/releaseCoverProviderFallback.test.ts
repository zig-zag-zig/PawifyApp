import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { closeMusicDb } from '../../../src/infrastructure/musicDb/musicDbClient.js';
import { createMusicDbFixture } from '../../helpers/musicDbFixture.js';

// Provider clients acquire shared token buckets. With no reachable Dapr state they
// fall back to a local limiter whose default 1s delay would dominate these tests, so
// the fallback delay is collapsed before the limiter module is first imported.
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

const GROUP_ID = 'e06540ef-1343-4c6d-982c-ed33339bbef8';
const RELEASE_ID = 'd7ffee2f-c783-4bfd-8f7c-7492675fc71f';
const DEEZER_ALBUM = 'https://www.deezer.com/album/1110718732';
const DEEZER_COVER =
    'https://cdn-images.dzcdn.net/images/cover/41fa7c11c9dbd52991c80b1a534403da/1000x1000-000000-80-0-0.jpg';

const musicBrainzCalls = (calls: Call[]) =>
    calls.filter((call) => call.url.includes('/invoke/musicbrainz/'));
const coverArtArchiveCalls = (calls: Call[]) =>
    calls.filter((call) => call.url.includes('/invoke/coverartarchive/'));

const deezerAlbumResponse = () => jsonResponse({ id: 1110718732, cover_xl: DEEZER_COVER });

const useMirrorFixture = (releases: Array<{ mbid: string; release_group_mbid: string }>) => {
    const path = createMusicDbFixture({
        releases: releases.map((release) => ({
            ...release,
            title: 'No Competition',
            date: '2026-10-04',
        })),
    });
    process.env.MUSIC_DB_PATH = path;
    closeMusicDb();
    return path;
};

const importLookup = async () => await import('../../../src/services/coverArt/coverArtLookup.js');

describe('fetchReleaseGroupCover provider fallback', () => {
    it('asks the API for a group the mirror has never seen and finds the Deezer cover', async () => {
        // This is the reported case: a single released after the mirror snapshot.
        // Cover Art Archive has no artwork; the release's Deezer relation does.
        const calls = stubFetch((call) => {
            if (call.url.includes(`/ws/2/release-group/${GROUP_ID}`)) {
                return jsonResponse({ id: GROUP_ID, relations: [], releases: [{ id: RELEASE_ID }] });
            }
            if (call.url.includes(`/ws/2/release/${RELEASE_ID}`)) {
                return jsonResponse({
                    id: RELEASE_ID,
                    relations: [{ url: { resource: DEEZER_ALBUM } }],
                });
            }
            if (call.url.includes('/invoke/deezer/')) {
                return deezerAlbumResponse();
            }
            throw new Error(`unexpected call ${call.url}`);
        });

        const { fetchReleaseGroupCover, resetProviderLinkCachesForTests } = {
            ...(await importLookup()),
            ...(await import('../../../src/services/coverArt/providerLinks.js')),
        };
        resetProviderLinkCachesForTests();

        const image = await fetchReleaseGroupCover(GROUP_ID, undefined, [RELEASE_ID], {
            deezerUrls: [],
            tidalUrls: [],
        });

        assert.equal(image, DEEZER_COVER);
        assert.equal(musicBrainzCalls(calls).length, 2);
        assert.equal(coverArtArchiveCalls(calls).length, 0);
    });

    it('never asks the API when the mirror already knows the group', async () => {
        useMirrorFixture([{ mbid: RELEASE_ID, release_group_mbid: GROUP_ID }]);

        const calls = stubFetch((call) => {
            if (call.url.includes('/invoke/coverartarchive/')) {
                return new Response(null, { status: 404 });
            }
            throw new Error(`unexpected call ${call.url}`);
        });

        const { fetchReleaseGroupCover } = await importLookup();
        const image = await fetchReleaseGroupCover(GROUP_ID, undefined, [RELEASE_ID], {
            deezerUrls: [],
            tidalUrls: [],
        });

        assert.equal(image, null);
        assert.equal(musicBrainzCalls(calls).length, 0);
    });

    it('prefers mirror provider links over the API', async () => {
        const path = createMusicDbFixture({
            releases: [
                {
                    mbid: RELEASE_ID,
                    release_group_mbid: GROUP_ID,
                    title: 'No Competition',
                    date: '2026-10-04',
                },
            ],
            externalLinks: [
                {
                    entity_type: 'release',
                    entity_mbid: RELEASE_ID,
                    rel_type: 'free streaming',
                    url: DEEZER_ALBUM,
                },
            ],
        });
        process.env.MUSIC_DB_PATH = path;
        closeMusicDb();

        const calls = stubFetch((call) => {
            if (call.url.includes('/invoke/deezer/')) {
                return deezerAlbumResponse();
            }
            throw new Error(`unexpected call ${call.url}`);
        });

        const { fetchReleaseGroupCover } = await importLookup();
        const image = await fetchReleaseGroupCover(GROUP_ID, undefined, [RELEASE_ID], {
            deezerUrls: [DEEZER_ALBUM],
            tidalUrls: [],
        });

        assert.equal(image, DEEZER_COVER);
        assert.equal(musicBrainzCalls(calls).length, 0);
    });
});

describe('fetchReleaseCover provider fallback', () => {
    it('asks the API for a release the mirror has never seen', async () => {
        useMirrorFixture([{ mbid: RELEASE_ID, release_group_mbid: GROUP_ID }]);

        const calls = stubFetch((call) => {
            if (call.url.includes(`/ws/2/release/${'unknown-release'}`)) {
                return jsonResponse({
                    id: 'unknown-release',
                    relations: [{ url: { resource: DEEZER_ALBUM } }],
                });
            }
            if (call.url.includes('/invoke/deezer/')) {
                return deezerAlbumResponse();
            }
            throw new Error(`unexpected call ${call.url}`);
        });

        const { fetchReleaseCover } = await importLookup();
        const image = await fetchReleaseCover('unknown-release', GROUP_ID);

        assert.equal(image, DEEZER_COVER);
        assert.equal(musicBrainzCalls(calls).length, 1);
    });

    it('does not ask the API for a release the mirror knows without streaming links', async () => {
        useMirrorFixture([{ mbid: RELEASE_ID, release_group_mbid: GROUP_ID }]);

        const calls = stubFetch((call) => {
            if (call.url.includes('/invoke/coverartarchive/')) {
                return new Response(null, { status: 404 });
            }
            throw new Error(`unexpected call ${call.url}`);
        });

        const { fetchReleaseCover } = await importLookup();
        const image = await fetchReleaseCover(RELEASE_ID, GROUP_ID);

        assert.equal(image, null);
        assert.equal(musicBrainzCalls(calls).length, 0);
    });
});