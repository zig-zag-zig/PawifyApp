import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { closeMusicDb } from '../../../src/infrastructure/musicDb/musicDbClient.js';
import { resetEntityImageRepositoryForTests } from '../../../src/infrastructure/musicDb/entityImageRepository.js';
import { createMusicDbFixture } from '../../helpers/musicDbFixture.js';

process.env.DAPR_HTTP_ENDPOINT = 'http://dapr.test:3500';
process.env.RATE_LIMIT_FALLBACK_DELAY_MS = '1';

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

const RELEASE_ID = 'd7ffee2f-c783-4bfd-8f7c-7492675fc71f';
const DEAD_URL = 'https://cdn-images.dzcdn.net/images/cover/dead/1000x1000.jpg';

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

const useMirror = (withDeezerLink = false): void => {
    const path = createMusicDbFixture({
        releases: [{ mbid: RELEASE_ID, title: 'No Competition', release_group_mbid: 'g1' }],
        externalLinks: withDeezerLink
            ? [
                  {
                      entity_type: 'release',
                      entity_mbid: RELEASE_ID,
                      rel_type: 'free streaming',
                      url: 'https://www.deezer.com/album/1',
                  },
              ]
            : [],
        entityImages: [
            {
                entity_type: 'release',
                entity_mbid: RELEASE_ID,
                service_id: 4,
                image_token: 'cover/dead/1000x1000.jpg',
                fetched_at: 0,
            },
        ],
    });
    process.env.MUSIC_DB_PATH = path;
    closeMusicDb();
    resetEntityImageRepositoryForTests();
};

beforeEach(() => {
    useMirror();
});

afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
    closeMusicDb();
    resetEntityImageRepositoryForTests();
});

describe('invalidateEntityImage', () => {
    it('keeps the row when the CDN still serves the image', async () => {
        stubFetch(() => new Response(null, { status: 200 }));
        const { invalidateEntityImage, resetInvalidateEntityImageCooldownForTests } =
            await import('../../../src/services/artwork/invalidateEntityImage.js');
        resetInvalidateEntityImageCooldownForTests();

        const result = await invalidateEntityImage('release', RELEASE_ID);

        assert.equal(result.invalidated, false);
        assert.equal(result.url, DEAD_URL);
    });

    it('keeps the row on a transient CDN failure', async () => {
        stubFetch(() => new Response(null, { status: 503 }));
        const { invalidateEntityImage, resetInvalidateEntityImageCooldownForTests } =
            await import('../../../src/services/artwork/invalidateEntityImage.js');
        resetInvalidateEntityImageCooldownForTests();

        const result = await invalidateEntityImage('release', RELEASE_ID);

        assert.equal(result.invalidated, false);
        assert.equal(result.url, DEAD_URL);
    });

    it('replaces the row when the CDN confirms the file is gone', async () => {
        stubFetch((call) => {
            if (call.method === 'HEAD') {
                return new Response(null, { status: 404 });
            }
            if (call.url.includes('/invoke/coverartarchive/')) {
                return new Response(null, { status: 404 });
            }
            return new Response(null, { status: 404 });
        });
        const { invalidateEntityImage, resetInvalidateEntityImageCooldownForTests } =
            await import('../../../src/services/artwork/invalidateEntityImage.js');
        resetInvalidateEntityImageCooldownForTests();

        const result = await invalidateEntityImage('release', RELEASE_ID);

        assert.equal(result.invalidated, true);
        assert.equal(result.url, null);
    });

    it('leaves the row pending when an upstream API still returns the dead URL and no fallback exists', async () => {
        useMirror(true);
        stubFetch((call) => {
            if (call.url === DEAD_URL && call.method === 'HEAD') {
                return new Response(null, { status: 404 });
            }
            if (call.url.includes('/invoke/deezer/') && call.url.includes('/album/')) {
                return new Response(JSON.stringify({ id: 1, cover_xl: DEAD_URL }), {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                });
            }
            if (call.url.includes('/invoke/coverartarchive/')) {
                return new Response(null, { status: 404 });
            }
            return new Response(null, { status: 404 });
        });
        const { invalidateEntityImage, resetInvalidateEntityImageCooldownForTests } =
            await import('../../../src/services/artwork/invalidateEntityImage.js');
        const { readEntityImage } =
            await import('../../../src/infrastructure/musicDb/entityImageRepository.js');
        resetInvalidateEntityImageCooldownForTests();

        const result = await invalidateEntityImage('release', RELEASE_ID);

        assert.equal(result.invalidated, true);
        assert.equal(result.url, null);
        assert.equal(
            readEntityImage('release', RELEASE_ID)?.service,
            'pending',
            'a broken upstream CDN link with no fallback must stay pending rather than none',
        );
    });

    it('falls through past a dead Deezer URL to Cover Art Archive and saves the working cover', async () => {
        useMirror(true);
        stubFetch((call) => {
            if (call.url === DEAD_URL && call.method === 'HEAD') {
                return new Response(null, { status: 404 });
            }
            if (call.url.includes('/invoke/deezer/') && call.url.includes('/album/')) {
                return new Response(JSON.stringify({ id: 1, cover_xl: DEAD_URL }), {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                });
            }
            if (call.url.includes('/invoke/coverartarchive/')) {
                return new Response(null, { status: 200 });
            }
            return new Response(null, { status: 404 });
        });
        const { invalidateEntityImage, resetInvalidateEntityImageCooldownForTests } =
            await import('../../../src/services/artwork/invalidateEntityImage.js');
        const { readEntityImage } =
            await import('../../../src/infrastructure/musicDb/entityImageRepository.js');
        resetInvalidateEntityImageCooldownForTests();

        const result = await invalidateEntityImage('release', RELEASE_ID);

        assert.equal(result.invalidated, true);
        assert.equal(result.url, `https://coverartarchive.org/release/${RELEASE_ID}/front-500`);
        assert.equal(readEntityImage('release', RELEASE_ID)?.service, 'caa_rel');
    });

    it('probes at most once per cooldown window', async () => {
        const calls = stubFetch(() => new Response(null, { status: 200 }));
        const { invalidateEntityImage, resetInvalidateEntityImageCooldownForTests } =
            await import('../../../src/services/artwork/invalidateEntityImage.js');
        resetInvalidateEntityImageCooldownForTests();

        await invalidateEntityImage('release', RELEASE_ID);
        const probesAfterFirst = calls.length;
        await invalidateEntityImage('release', RELEASE_ID);

        assert.equal(calls.length, probesAfterFirst, 'second report must not probe again');
    });
});
