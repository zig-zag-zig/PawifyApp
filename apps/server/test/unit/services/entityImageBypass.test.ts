import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

// Set before importing modules that evaluate runtimeConfig at load time.
process.env.DAPR_HTTP_ENDPOINT = 'http://dapr.test:3500';
process.env.RATE_LIMIT_FALLBACK_DELAY_MS = '1';
process.env.RATE_LIMIT_DEEZER_BURST = '1000';
process.env.RATE_LIMIT_DEEZER_REFILL_PER_SECOND = '1000';
process.env.RATE_LIMIT_DEEZER_STAGGER_MS = '0';

import { closeMusicDb } from '../../../src/infrastructure/musicDb/musicDbClient.js';
import {
    readEntityImage,
    resetEntityImageRepositoryForTests,
} from '../../../src/infrastructure/musicDb/entityImageRepository.js';
import { createMusicDbFixture } from '../../helpers/musicDbFixture.js';

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

const RELEASE_ID = 'd7ffee2f-c783-4bfd-8f7c-7492675fc71f';
const GROUP_ID = 'e06540ef-1343-4c6d-982c-ed33339bbef8';
const ARTIST_ID = '66120159-5fe7-4cdb-8c9a-7ac68e393c6f';
const STALE_SECONDS = Math.floor(Date.now() / 1000) - 400 * 24 * 60 * 60;

beforeEach(async () => {
    const path = createMusicDbFixture({
        artists: [{ mbid: ARTIST_ID, name: 'Czarface' }],
        releases: [{ mbid: RELEASE_ID, title: 'No Competition', release_group_mbid: GROUP_ID }],
        entityImages: [
            // Stale artist portrait: due for a background re-check.
            {
                entity_type: 'artist',
                entity_mbid: ARTIST_ID,
                service_id: 4,
                image_token: 'artist/old/1000x1000.jpg',
                fetched_at: STALE_SECONDS,
            },
        ],
    });
    process.env.MUSIC_DB_PATH = path;
    closeMusicDb();
    resetEntityImageRepositoryForTests();
    const { getRateLimiter } = await import('../../../src/services/musicApi/rateLimiter.js');
    getRateLimiter('deezer').resetBackoff();
});

afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
    closeMusicDb();
    resetEntityImageRepositoryForTests();
});

describe('bypassMirror', () => {
    it('ignores a stored artist portrait so revalidation reaches the providers', async () => {
        const { resolveArtistImage } =
            await import('../../../src/services/musicApi/artistImageSources.js');

        const mirrored = await resolveArtistImage({ artistId: ARTIST_ID });
        assert.equal(
            mirrored.image,
            'https://cdn-images.dzcdn.net/images/artist/old/1000x1000.jpg',
            'a stored row is served when the mirror is allowed',
        );

        const bypassed = await resolveArtistImage({
            artistId: ARTIST_ID,
            bypassMirror: true,
        });
        assert.equal(bypassed.image, null, 'bypassMirror must not answer from the stored row');
    });

    it('persists a resolved image back into entity_images', async () => {
        const { persistResolvedEntityImage } =
            await import('../../../src/services/musicApi/entityImageFreshness.js');

        persistResolvedEntityImage(
            'release',
            RELEASE_ID,
            'https://cdn-images.dzcdn.net/images/cover/new/1000x1000.jpg',
        );

        const row = readEntityImage('release', RELEASE_ID);
        assert.ok(row, 'a row must be written');
        assert.equal(row?.service, 'deezer');
        assert.equal(row?.url, 'https://cdn-images.dzcdn.net/images/cover/new/1000x1000.jpg');
    });

    it('returns a stale artist portrait immediately and refreshes entity_images in the background using mirror links', async () => {
        const path = createMusicDbFixture({
            artists: [{ mbid: ARTIST_ID, name: 'Czarface' }],
            externalLinks: [
                {
                    entity_type: 'artist',
                    entity_mbid: ARTIST_ID,
                    rel_type: 'free streaming',
                    url: 'https://www.deezer.com/artist/860',
                },
            ],
            entityImages: [
                {
                    entity_type: 'artist',
                    entity_mbid: ARTIST_ID,
                    service_id: 4,
                    image_token: 'artist/old/1000x1000.jpg',
                    fetched_at: STALE_SECONDS,
                },
            ],
        });
        process.env.MUSIC_DB_PATH = path;
        process.env.DAPR_HTTP_ENDPOINT = 'http://dapr.test:3500';
        process.env.RATE_LIMIT_FALLBACK_DELAY_MS = '1';
        closeMusicDb();
        resetEntityImageRepositoryForTests();

        const freshUrl = 'https://cdn-images.dzcdn.net/images/artist/fresh/1000x1000.jpg';
        globalThis.fetch = (async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url === freshUrl) {
                return new Response(null, { status: 200 });
            }
            if (url.includes('/invoke/deezer/') && url.includes('/artist/860')) {
                return new Response(
                    JSON.stringify({ id: 860, name: 'Czarface', picture_xl: freshUrl }),
                    {
                        status: 200,
                        headers: { 'content-type': 'application/json' },
                    },
                );
            }
            return new Response(null, { status: 404 });
        }) as typeof fetch;

        const { partitionArtistProfileImages } =
            await import('../../../src/services/cache/partitionCachedAssets.js');

        const partition = await partitionArtistProfileImages([{ artistId: ARTIST_ID }]);
        assert.deepEqual(partition.pending, []);
        assert.equal(
            partition.resolved[ARTIST_ID],
            'https://cdn-images.dzcdn.net/images/artist/old/1000x1000.jpg',
            'current request must get the stored image immediately without waiting',
        );

        // Wait briefly for the detached revalidation to finish writing the refreshed token.
        for (let attempt = 0; attempt < 40; attempt += 1) {
            if (readEntityImage('artist', ARTIST_ID)?.url === freshUrl) {
                break;
            }
            await new Promise((resolve) => setTimeout(resolve, 15));
        }

        assert.equal(
            readEntityImage('artist', ARTIST_ID)?.url,
            freshUrl,
            'background revalidation must refresh entity_images using mirror links instead of wiping it',
        );
    });

    it('settles a thrice-stale confirmed miss to fetched_at = 0 instead of overwriting it with now', async () => {
        const path = createMusicDbFixture({
            artists: [{ mbid: ARTIST_ID, name: 'Czarface' }],
            externalLinks: [
                {
                    entity_type: 'artist',
                    entity_mbid: ARTIST_ID,
                    rel_type: 'free streaming',
                    url: 'https://www.deezer.com/artist/860',
                },
            ],
            entityImages: [
                {
                    entity_type: 'artist',
                    entity_mbid: ARTIST_ID,
                    service_id: 0,
                    image_token: '',
                    fetched_at: STALE_SECONDS,
                },
            ],
        });
        process.env.MUSIC_DB_PATH = path;
        process.env.DAPR_HTTP_ENDPOINT = 'http://dapr.test:3500';
        process.env.RATE_LIMIT_FALLBACK_DELAY_MS = '1';
        closeMusicDb();
        resetEntityImageRepositoryForTests();

        globalThis.fetch = (async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes('/invoke/deezer/') && url.includes('/artist/860')) {
                return new Response(
                    JSON.stringify({ error: { type: 'DataException', code: 800 } }),
                    { status: 200, headers: { 'content-type': 'application/json' } },
                );
            }
            return new Response(null, { status: 404 });
        }) as typeof fetch;

        const { partitionArtistProfileImages } =
            await import('../../../src/services/cache/partitionCachedAssets.js');

        const partition = await partitionArtistProfileImages([{ artistId: ARTIST_ID }]);
        assert.equal(partition.resolved[ARTIST_ID], null);

        for (let attempt = 0; attempt < 40; attempt += 1) {
            if (readEntityImage('artist', ARTIST_ID)?.fetchedAt === 0) {
                break;
            }
            await new Promise((resolve) => setTimeout(resolve, 15));
        }

        const settled = readEntityImage('artist', ARTIST_ID);
        assert.equal(settled?.service, 'none');
        assert.equal(
            settled?.fetchedAt,
            0,
            'a >7-day miss that still has no artwork must settle permanently to fetched_at = 0',
        );
    });

    it('preserves a valid artist portrait when background revalidation hits a transient error', async () => {
        const path = createMusicDbFixture({
            artists: [{ mbid: ARTIST_ID, name: 'Czarface' }],
            externalLinks: [
                {
                    entity_type: 'artist',
                    entity_mbid: ARTIST_ID,
                    rel_type: 'free streaming',
                    url: 'https://www.deezer.com/artist/860',
                },
            ],
            entityImages: [
                {
                    entity_type: 'artist',
                    entity_mbid: ARTIST_ID,
                    service_id: 4,
                    image_token: 'artist/keep-me/1000x1000.jpg',
                    fetched_at: STALE_SECONDS,
                },
            ],
        });
        process.env.MUSIC_DB_PATH = path;
        process.env.DAPR_HTTP_ENDPOINT = 'http://dapr.test:3500';
        process.env.RATE_LIMIT_FALLBACK_DELAY_MS = '1';
        closeMusicDb();
        resetEntityImageRepositoryForTests();

        globalThis.fetch = (async () => new Response(null, { status: 503 })) as typeof fetch;

        const { partitionArtistProfileImages } =
            await import('../../../src/services/cache/partitionCachedAssets.js');

        const partition = await partitionArtistProfileImages([{ artistId: ARTIST_ID }]);
        assert.equal(
            partition.resolved[ARTIST_ID],
            'https://cdn-images.dzcdn.net/images/artist/keep-me/1000x1000.jpg',
        );

        await new Promise((resolve) => setTimeout(resolve, 100));

        assert.equal(
            readEntityImage('artist', ARTIST_ID)?.url,
            'https://cdn-images.dzcdn.net/images/artist/keep-me/1000x1000.jpg',
            'a transient 503 during background refresh must not erase the stored portrait',
        );
    });
});
