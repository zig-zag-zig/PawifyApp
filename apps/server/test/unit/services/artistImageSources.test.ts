import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { installFetch } from '../../helpers/daprTestHelpers.js';

const PICTURE_UUID = 'ea1baa90-da2a-4193-8e20-e54f79a8a4dc';
const BASE_PATH = 'ea1baa90/da2a/4193/8e20/e54f79a8a4dc';
const TIDAL_IMAGE = `https://resources.tidal.com/images/${BASE_PATH}/750x750.jpg`;
const DEEZER_IMAGE = 'https://cdn-images.dzcdn.net/images/artist/abc/1000x1000.jpg';
const DISCOGS_IMAGE = 'https://img.discogs.com/artist.jpg';

const DEEZER_URL = 'https://www.deezer.com/artist/860';
const TIDAL_URL = 'https://tidal.com/artist/9706';
const DISCOGS_URL = 'https://www.discogs.com/artist/45467';

const jsonResponse = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });

type ProviderResponses = {
    deezer?: Response;
    tidal?: Response;
    tidalImage?: Response;
    discogs?: Response;
};

const okDeezer = (): Response => jsonResponse({ picture_xl: DEEZER_IMAGE });
const okTidal = (): Response => jsonResponse({ id: 9706, picture: PICTURE_UUID });
const okTidalImage = (): Response => new Response(null, { status: 200 });
const okDiscogs = (): Response =>
    jsonResponse({ name: 'Pink Floyd', images: [{ uri: DISCOGS_IMAGE }] });

/**
 * Routes every Dapr call to a canned provider response and records which
 * providers the chain actually reached.
 */
const installProviders = (responses: ProviderResponses): { reached: string[] } => {
    const reached: string[] = [];
    installFetch((url) => {
        if (url.startsWith('http://dapr.test/v1.0/secrets/')) {
            return jsonResponse({
                'tidal-token': 'secret-token',
                'discogs-token': 'discogs-secret',
            });
        }

        const provider = url.includes('/invoke/tidalimages/')
            ? 'tidalImage'
            : url.includes('/invoke/tidal/')
              ? 'tidal'
              : url.includes('/invoke/deezer/')
                ? 'deezer'
                : url.includes('/invoke/discogs/')
                  ? 'discogs'
                  : 'unknown';

        // Deezer artwork validation HEADs the CDN directly. It is a check on the
        // Deezer result rather than a provider fallback, so it is not recorded.
        if (provider === 'unknown' && url.includes('cdn-images.dzcdn.net')) {
            return new Response(null, { status: 200 });
        }

        reached.push(provider);
        const response = responses[provider as keyof ProviderResponses];
        return response ?? jsonResponse({ error: 'unstubbed provider' }, 500);
    });
    return { reached };
};

beforeEach(async () => {
    const { clearDaprSecretCache } =
        await import('../../../src/infrastructure/dapr/daprSecrets.js');
    clearDaprSecretCache();
});

const importChain = async () =>
    (await import('../../../src/services/musicApi/artistImageSources.js')).resolveArtistImage;

describe('resolveArtistImage provider chain', () => {
    it('stops at Deezer and never calls Tidal or Discogs', async () => {
        const { reached } = installProviders({
            deezer: okDeezer(),
            tidal: okTidal(),
            tidalImage: okTidalImage(),
            discogs: okDiscogs(),
        });

        const resolveArtistImage = await importChain();
        const result = await resolveArtistImage({
            artistName: 'Pink Floyd',
            deezerUrls: [DEEZER_URL],
            tidalUrls: [TIDAL_URL],
            discogsUrls: [DISCOGS_URL],
        });

        assert.equal(result.image, DEEZER_IMAGE);
        assert.equal(result.source, 'deezer');
        assert.deepEqual(reached, ['deezer']);
    });

    it('fast-fails past a rate-limited Deezer straight to Tidal', async () => {
        const { reached } = installProviders({
            deezer: jsonResponse({ error: 'slow down' }, 429),
            tidal: okTidal(),
            tidalImage: okTidalImage(),
            discogs: okDiscogs(),
        });

        const resolveArtistImage = await importChain();
        const result = await resolveArtistImage({
            artistName: 'Pink Floyd',
            deezerUrls: [DEEZER_URL],
            tidalUrls: [TIDAL_URL],
            discogsUrls: [DISCOGS_URL],
        });

        assert.equal(result.image, TIDAL_IMAGE);
        assert.equal(result.source, 'tidal');
        // Deezer is asked exactly once: no app-level retry, and Discogs is
        // spared because Tidal answered.
        assert.deepEqual(reached, ['deezer', 'tidal', 'tidalImage']);
        assert.deepEqual(result.transientFailures, ['deezer']);
    });

    it('falls through confirmed misses to Discogs', async () => {
        const { reached } = installProviders({
            deezer: jsonResponse({ error: { message: 'no data', code: 800 } }),
            tidal: jsonResponse({ status: 404, subStatus: 2001 }, 404),
            discogs: okDiscogs(),
        });

        const resolveArtistImage = await importChain();
        const result = await resolveArtistImage({
            artistName: 'Pink Floyd',
            deezerUrls: [DEEZER_URL],
            tidalUrls: [TIDAL_URL],
            discogsUrls: [DISCOGS_URL],
        });

        assert.equal(result.image, DISCOGS_IMAGE);
        assert.equal(result.source, 'discogs');
        assert.deepEqual(reached, ['deezer', 'tidal', 'discogs']);
        assert.deepEqual(result.confirmedMisses, ['deezer', 'tidal']);
    });

    it('still resolves via Discogs when Tidal rejects the token', async () => {
        installProviders({
            deezer: jsonResponse({ error: { message: 'no data', code: 800 } }),
            tidal: jsonResponse({ status: 401, subStatus: 6004 }, 401),
            discogs: okDiscogs(),
        });

        const resolveArtistImage = await importChain();
        const result = await resolveArtistImage({
            artistName: 'Pink Floyd',
            deezerUrls: [DEEZER_URL],
            tidalUrls: [TIDAL_URL],
            discogsUrls: [DISCOGS_URL],
        });

        assert.equal(result.image, DISCOGS_IMAGE);
        assert.equal(result.source, 'discogs');
        assert.deepEqual(result.transientFailures, ['tidal']);
    });

    it('reports a confirmed miss when every provider answers with no image', async () => {
        installProviders({
            deezer: jsonResponse({ id: 860, name: 'Pink Floyd' }),
            tidal: jsonResponse({ id: 9706, picture: null }),
            discogs: jsonResponse({ name: 'Pink Floyd', images: [] }),
        });

        const resolveArtistImage = await importChain();
        const result = await resolveArtistImage({
            artistName: 'Pink Floyd',
            deezerUrls: [DEEZER_URL],
            tidalUrls: [TIDAL_URL],
            discogsUrls: [DISCOGS_URL],
        });

        assert.equal(result.image, null);
        assert.equal(result.source, undefined);
        assert.deepEqual(result.confirmedMisses, ['deezer', 'tidal', 'discogs']);
        assert.deepEqual(result.transientFailures, []);
    });

    it('reports a transient failure when every provider is unavailable', async () => {
        installProviders({
            deezer: jsonResponse({ error: 'slow down' }, 429),
            tidal: jsonResponse({ status: 401, subStatus: 6004 }, 401),
            discogs: jsonResponse({ error: 'boom' }, 500),
        });

        const resolveArtistImage = await importChain();
        const result = await resolveArtistImage({
            artistName: 'Pink Floyd',
            deezerUrls: [DEEZER_URL],
            tidalUrls: [TIDAL_URL],
            discogsUrls: [DISCOGS_URL],
        });

        assert.equal(result.image, undefined);
        assert.deepEqual(result.transientFailures, ['deezer', 'tidal', 'discogs']);
        assert.deepEqual(result.confirmedMisses, []);
    });

    it('lets one transient failure outweigh confirmed misses', async () => {
        installProviders({
            deezer: jsonResponse({ error: 'not found' }, 404),
            tidal: jsonResponse({ error: 'slow down' }, 429),
        });

        const resolveArtistImage = await importChain();
        const result = await resolveArtistImage({
            deezerUrls: [DEEZER_URL],
            tidalUrls: [TIDAL_URL],
        });

        assert.equal(result.image, undefined);
        assert.deepEqual(result.confirmedMisses, ['deezer']);
        assert.deepEqual(result.transientFailures, ['tidal']);
    });

    it('skips providers the caller already proved have no image', async () => {
        const { reached } = installProviders({
            deezer: okDeezer(),
            tidal: okTidal(),
            tidalImage: okTidalImage(),
            discogs: okDiscogs(),
        });

        const resolveArtistImage = await importChain();
        const result = await resolveArtistImage({
            artistName: 'Pink Floyd',
            deezerUrls: [DEEZER_URL],
            tidalUrls: [TIDAL_URL],
            discogsUrls: [DISCOGS_URL],
            skipProviders: new Set(['deezer']),
        });

        assert.equal(result.image, TIDAL_IMAGE);
        assert.equal(result.source, 'tidal');
        assert.deepEqual(reached, ['tidal', 'tidalImage']);
    });

    it('only asks Discogs when discogs urls are present', async () => {
        const { reached } = installProviders({
            deezer: jsonResponse({ error: { message: 'no data', code: 800 } }),
            discogs: okDiscogs(),
        });

        const resolveArtistImage = await importChain();
        const result = await resolveArtistImage({
            artistName: 'Pink Floyd',
            deezerUrls: [DEEZER_URL],
        });

        assert.deepEqual(reached, ['deezer']);
        assert.equal(result.image, null);
        assert.deepEqual(result.confirmedMisses, ['deezer']);
    });

    it('resolves nothing when the artist has no provider links', async () => {
        const { reached } = installProviders({ deezer: okDeezer() });

        const resolveArtistImage = await importChain();
        const result = await resolveArtistImage({ artistName: 'Pink Floyd' });

        assert.deepEqual(reached, []);
        assert.equal(result.image, null);
    });
});
