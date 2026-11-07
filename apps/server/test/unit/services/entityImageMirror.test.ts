import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, afterEach, describe, it } from 'node:test';

import Database from 'better-sqlite3';

import {
    closeMusicDb,
    musicDbHasEntityImages,
} from '../../../src/infrastructure/musicDb/musicDbClient.js';
import {
    readEntityImage,
    readEntityImages,
    resetEntityImageRepositoryForTests,
} from '../../../src/infrastructure/musicDb/entityImageRepository.js';
import {
    cleanupMusicDbFixtures,
    createMusicDbFixture,
    type MusicDbSeed,
} from '../../helpers/musicDbFixture.js';

// Provider clients acquire shared token buckets. With no reachable Dapr state they
// fall back to a local limiter whose default delay would dominate these tests, so
// the fallback delay is collapsed before the limiter module is first imported.
process.env.DAPR_HTTP_ENDPOINT = 'http://dapr.test:3500';
process.env.RATE_LIMIT_FALLBACK_DELAY_MS = '1';
process.env.RATE_LIMIT_DEEZER_BURST = '1000';
process.env.RATE_LIMIT_DEEZER_REFILL_PER_SECOND = '1000';
process.env.RATE_LIMIT_DEEZER_STAGGER_MS = '0';
process.env.RATE_LIMIT_TIDAL_MAX_CONCURRENT = '8';
process.env.RATE_LIMIT_TIDAL_DELAY_MS = '0';
process.env.TIDAL_API_TOKEN = 'test-token';
process.env.TIDAL_COUNTRY_CODE = 'US';

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

const RELEASE_ID = 'd7ffee2f-c783-4bfd-8f7c-7492675fc71f';
const GROUP_ID = 'e06540ef-1343-4c6d-982c-ed33339bbef8';
const ARTIST_ID = '66120159-5fe7-4cdb-8c9a-7ac68e393c6f';

const DEEZER_TOKEN = 'cover/41fa7c11c9dbd52991c80b1a534403da/1000x1000-000000-80-0-0.jpg';
const DEEZER_IMAGE = `https://cdn-images.dzcdn.net/images/${DEEZER_TOKEN}`;
const TIDAL_TOKEN = 'ea1baa90/da2a/4193/8e20/e54f79a8a4dc/750x750.jpg';
const TIDAL_IMAGE = `https://resources.tidal.com/images/${TIDAL_TOKEN}`;
const DISCOGS_IMAGE = 'https://i.discogs.com/artist-primary.jpg';
const DEEZER_ALBUM = 'https://www.deezer.com/album/1110718732';

const requireForTest = createRequire(__filename);

const DAY_SECONDS = 24 * 60 * 60;
const nowSeconds = () => Math.floor(Date.now() / 1000);

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

/** Fails the test if the provider chain is reached at all. */
const forbidProviderCalls = (): Call[] =>
    stubFetch((call) => {
        throw new Error(`unexpected provider call ${call.url}`);
    });

const useMirror = (seed: MusicDbSeed = {}): string => {
    const path = createMusicDbFixture(seed);
    process.env.MUSIC_DB_PATH = path;
    closeMusicDb();
    resetEntityImageRepositoryForTests();
    return path;
};

/** Drops the image tables, which is what an older mirror looks like. */
const dropImageTables = (path: string): void => {
    const db = new Database(path);
    db.exec('DROP TABLE entity_images; DROP TABLE image_services;');
    db.close();
};

const imageRow = (
    entityType: 'artist' | 'release' | 'release_group',
    mbid: string,
    serviceId: number,
    imageToken = '',
    fetchedAt = 0,
) => ({
    entity_type: entityType,
    entity_mbid: mbid,
    service_id: serviceId,
    image_token: imageToken,
    fetched_at: fetchedAt,
});

afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
    closeMusicDb();
    resetEntityImageRepositoryForTests();
});

describe('mirrored release artwork', () => {
    it('returns a mirrored Deezer token without touching any provider', async () => {
        useMirror({
            entityImages: [imageRow('release', RELEASE_ID, 4, DEEZER_TOKEN, nowSeconds())],
        });
        const calls = forbidProviderCalls();

        const { resolveReleaseImage } =
            await import('../../../src/services/musicApi/releaseImageSources.js');
        const result = await resolveReleaseImage({
            releaseId: RELEASE_ID,
            releaseGroupId: GROUP_ID,
            deezerUrls: [DEEZER_ALBUM],
            tidalUrls: [],
        });

        assert.equal(result.image, DEEZER_IMAGE);
        assert.equal(result.source, 'deezer');
        assert.deepEqual(result.confirmedMisses, []);
        assert.deepEqual(result.transientFailures, []);
        assert.deepEqual(calls, []);
    });

    it('returns a mirrored Cover Art Archive token without touching any provider', async () => {
        useMirror({
            entityImages: [imageRow('release', RELEASE_ID, 2, RELEASE_ID, 0)],
        });
        const calls = forbidProviderCalls();

        const { resolveReleaseImage } =
            await import('../../../src/services/musicApi/releaseImageSources.js');
        const result = await resolveReleaseImage({ releaseId: RELEASE_ID });

        assert.equal(result.image, `https://coverartarchive.org/release/${RELEASE_ID}/front-500`);
        assert.equal(result.source, 'coverartarchive');
        assert.deepEqual(calls, []);
    });

    it('falls back to the group row when the release has no row of its own', async () => {
        useMirror({
            entityImages: [imageRow('release_group', GROUP_ID, 5, TIDAL_TOKEN, 0)],
        });
        const calls = forbidProviderCalls();

        const { resolveReleaseImage } =
            await import('../../../src/services/musicApi/releaseImageSources.js');
        const result = await resolveReleaseImage({
            releaseId: RELEASE_ID,
            releaseGroupId: GROUP_ID,
        });

        assert.equal(result.image, TIDAL_IMAGE);
        assert.equal(result.source, 'tidal');
        assert.deepEqual(calls, []);
    });

    it('treats a fresh confirmed miss as authoritative when the group agrees', async () => {
        // The backfill derives a group row for every group, so a real miss is
        // recorded at both levels; the two together are what make the verdict
        // final.
        useMirror({
            entityImages: [
                imageRow('release', RELEASE_ID, 0, '', nowSeconds()),
                imageRow('release_group', GROUP_ID, 0, '', nowSeconds()),
            ],
        });
        const calls = forbidProviderCalls();

        const { resolveReleaseImage } =
            await import('../../../src/services/musicApi/releaseImageSources.js');
        const result = await resolveReleaseImage({
            releaseId: RELEASE_ID,
            releaseGroupId: GROUP_ID,
            deezerUrls: [DEEZER_ALBUM],
        });

        assert.equal(result.image, null);
        assert.equal(result.source, undefined);
        assert.deepEqual(result.confirmedMisses, ['deezer', 'tidal', 'coverartarchive']);
        assert.deepEqual(result.transientFailures, []);
        assert.deepEqual(calls, []);
    });

    it('still probes the group endpoint when only the release row says missing', async () => {
        // A pressing can have no art of its own while its group does, so an absent
        // group row must not turn the release's miss into a page-wide verdict.
        useMirror({
            entityImages: [imageRow('release', RELEASE_ID, 0, '', nowSeconds())],
        });
        const calls = stubFetch((call) => {
            if (call.url.includes('/invoke/coverartarchive/')) {
                return new Response(null, { status: 404 });
            }
            throw new Error(`unexpected call ${call.url}`);
        });

        const { resolveReleaseImage } =
            await import('../../../src/services/musicApi/releaseImageSources.js');
        const result = await resolveReleaseImage({
            releaseId: RELEASE_ID,
            releaseGroupId: GROUP_ID,
        });

        assert.equal(result.image, null);
        assert.equal(
            calls.some((call) => call.url.includes(`/release-group/${GROUP_ID}`)),
            true,
        );
    });

    it('re-derives a confirmed miss older than a week', async () => {
        useMirror({
            entityImages: [imageRow('release', RELEASE_ID, 0, '', nowSeconds() - 8 * DAY_SECONDS)],
        });
        const calls = stubFetch((call) => {
            if (call.url.includes('/invoke/deezer/')) {
                return jsonResponse({ id: 1110718732, cover_xl: DEEZER_IMAGE });
            }
            throw new Error(`unexpected call ${call.url}`);
        });

        const { resolveReleaseImage } =
            await import('../../../src/services/musicApi/releaseImageSources.js');
        const result = await resolveReleaseImage({
            releaseId: RELEASE_ID,
            deezerUrls: [DEEZER_ALBUM],
        });

        assert.equal(result.image, DEEZER_IMAGE);
        assert.equal(result.source, 'deezer');
        assert.equal(calls.length > 0, true);
    });

    it('still writes a mirrored cover into the asset cache', async () => {
        // Instant lookup is only half the win: the resolved state must land in the
        // existing per-release cache, otherwise the next render pays again.
        useMirror({
            entityImages: [imageRow('release', RELEASE_ID, 4, DEEZER_TOKEN, nowSeconds())],
        });
        const calls = forbidProviderCalls();

        const cacheModule = requireForTest('../../../src/services/coverArt/coverArtCache.js') as {
            readReleaseCoverState: (releaseId: string) => Promise<unknown>;
            writeReleaseCoverState: (
                releaseId: string,
                state: unknown,
                ttl?: number,
            ) => Promise<void>;
        };
        const originalRead = cacheModule.readReleaseCoverState;
        const originalWrite = cacheModule.writeReleaseCoverState;
        const written: Array<{ releaseId: string; url: unknown }> = [];

        cacheModule.readReleaseCoverState = async () => null;
        cacheModule.writeReleaseCoverState = async (releaseId, state) => {
            written.push({ releaseId, url: (state as { url?: unknown }).url });
        };

        try {
            const { getReleaseCover } = await import('../../../src/services/coverArtService.js');
            const result = await getReleaseCover(RELEASE_ID, null, undefined);

            assert.equal(result.state.url, DEEZER_IMAGE);
            assert.deepEqual(written, [{ releaseId: RELEASE_ID, url: DEEZER_IMAGE }]);
            assert.deepEqual(calls, []);
        } finally {
            cacheModule.readReleaseCoverState = originalRead;
            cacheModule.writeReleaseCoverState = originalWrite;
        }
    });

    it('falls through while the mirror still says pending', async () => {
        useMirror({
            entityImages: [imageRow('release', RELEASE_ID, 1, '', 0)],
        });
        const calls = stubFetch((call) => {
            if (call.url.includes('/invoke/deezer/')) {
                return jsonResponse({ id: 1110718732, cover_xl: DEEZER_IMAGE });
            }
            throw new Error(`unexpected call ${call.url}`);
        });

        const { resolveReleaseImage } =
            await import('../../../src/services/musicApi/releaseImageSources.js');
        const result = await resolveReleaseImage({
            releaseId: RELEASE_ID,
            deezerUrls: [DEEZER_ALBUM],
        });

        assert.equal(result.image, DEEZER_IMAGE);
        assert.equal(result.source, 'deezer');
        assert.equal(calls.length > 0, true);
    });

    it('inherits the group cover for a release with no art of its own', async () => {
        // The production path (`getReleaseCover` → `fetchReleaseCover`) used to
        // return null as soon as the release row said miss, which dropped a group
        // cover the live chain would have found. Both verdicts must agree instead.
        useMirror({
            entityImages: [
                imageRow('release', RELEASE_ID, 0, '', nowSeconds()),
                imageRow('release_group', GROUP_ID, 3, GROUP_ID, 0),
            ],
        });
        const calls = forbidProviderCalls();

        const { fetchReleaseCover } =
            await import('../../../src/services/coverArt/coverArtLookup.js');
        const image = await fetchReleaseCover(RELEASE_ID, GROUP_ID);

        assert.equal(image, `https://coverartarchive.org/release-group/${GROUP_ID}/front-500`);
        assert.deepEqual(calls, []);
    });

    it('does not re-probe the release endpoint for a confirmed release miss', async () => {
        // The mirror already asked the release endpoint and it had nothing, so a
        // pending group row must not turn that verdict back into a network call.
        useMirror({
            entityImages: [
                imageRow('release', RELEASE_ID, 0, '', nowSeconds()),
                imageRow('release_group', GROUP_ID, 1, '', 0),
            ],
        });
        const calls = forbidProviderCalls();

        const { fetchReleaseCover } =
            await import('../../../src/services/coverArt/coverArtLookup.js');
        const image = await fetchReleaseCover(RELEASE_ID, GROUP_ID);

        assert.equal(image, null);
        assert.deepEqual(calls, []);
    });
});

describe('mirrored artist artwork', () => {
    it('returns a mirrored Tidal token without touching any provider', async () => {
        useMirror({
            entityImages: [imageRow('artist', ARTIST_ID, 5, TIDAL_TOKEN, nowSeconds())],
        });
        const calls = forbidProviderCalls();

        const { resolveArtistImage } =
            await import('../../../src/services/musicApi/artistImageSources.js');
        const result = await resolveArtistImage({
            artistId: ARTIST_ID,
            tidalUrls: ['https://tidal.com/artist/9706'],
        });

        assert.equal(result.image, TIDAL_IMAGE);
        assert.equal(result.source, 'tidal');
        assert.deepEqual(calls, []);
    });

    it('returns a mirrored Discogs url without touching any provider', async () => {
        useMirror({
            entityImages: [imageRow('artist', ARTIST_ID, 6, DISCOGS_IMAGE, 0)],
        });
        const calls = forbidProviderCalls();

        const { resolveArtistImage } =
            await import('../../../src/services/musicApi/artistImageSources.js');
        const result = await resolveArtistImage({
            artistId: ARTIST_ID,
            discogsUrls: ['https://www.discogs.com/artist/45467'],
        });

        assert.equal(result.image, DISCOGS_IMAGE);
        assert.equal(result.source, 'discogs');
        assert.deepEqual(calls, []);
    });

    it('treats a fresh confirmed miss as authoritative for artists too', async () => {
        useMirror({
            entityImages: [imageRow('artist', ARTIST_ID, 0, '', nowSeconds())],
        });
        const calls = forbidProviderCalls();

        const { resolveArtistImage } =
            await import('../../../src/services/musicApi/artistImageSources.js');
        const result = await resolveArtistImage({
            artistId: ARTIST_ID,
            deezerUrls: ['https://www.deezer.com/artist/860'],
            tidalUrls: ['https://tidal.com/artist/9706'],
            discogsUrls: ['https://www.discogs.com/artist/45467'],
        });

        assert.equal(result.image, null);
        assert.deepEqual(result.confirmedMisses, ['deezer', 'tidal', 'discogs']);
        assert.deepEqual(result.transientFailures, []);
        assert.deepEqual(calls, []);
    });
});

describe('mirrors without the image-state tables', () => {
    it('behaves exactly like before the tables existed', async () => {
        const path = createMusicDbFixture({});
        dropImageTables(path);
        process.env.MUSIC_DB_PATH = path;
        closeMusicDb();
        resetEntityImageRepositoryForTests();

        assert.equal(musicDbHasEntityImages(), false);
        assert.equal(readEntityImage('artist', ARTIST_ID), null);

        const calls = stubFetch((call) => {
            if (call.url.includes('/invoke/deezer/')) {
                return jsonResponse({ id: 1110718732, cover_xl: DEEZER_IMAGE });
            }
            throw new Error(`unexpected call ${call.url}`);
        });

        const { resolveReleaseImage } =
            await import('../../../src/services/musicApi/releaseImageSources.js');
        const result = await resolveReleaseImage({
            releaseId: RELEASE_ID,
            deezerUrls: [DEEZER_ALBUM],
        });

        assert.equal(result.image, DEEZER_IMAGE);
        assert.equal(result.source, 'deezer');
        assert.equal(calls.length > 0, true);
    });
});

describe('entity image repository', () => {
    it('chunks large id lists and preserves an offline fetched_at of 0', () => {
        const rows = Array.from({ length: 1201 }, (_, index) =>
            imageRow(
                'release',
                `release-${String(index).padStart(4, '0')}`,
                2,
                `token-${index}`,
                0,
            ),
        );
        useMirror({ entityImages: rows });

        const ids = rows.map((row) => String(row.entity_mbid));
        const records = readEntityImages('release', ids as readonly string[]);

        assert.equal(records.size, 1201);
        const first = records.get('release-0000');
        assert.equal(first?.service, 'caa_rel');
        assert.equal(first?.fetchedAt, 0);
        assert.equal(first?.url, 'https://coverartarchive.org/release/token-0/front-500');
    });

    it('ignores rows whose service row is missing instead of throwing', () => {
        const path = useMirror({
            entityImages: [imageRow('release', RELEASE_ID, 4, DEEZER_TOKEN, 0)],
        });

        const db = new Database(path);
        db.prepare('DELETE FROM image_services WHERE id = 4').run();
        db.close();
        closeMusicDb();
        resetEntityImageRepositoryForTests();

        assert.equal(readEntityImage('release', RELEASE_ID), null);
    });
});

after(() => {
    cleanupMusicDbFixtures();
});
