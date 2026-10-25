import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { installFetch } from '../../helpers/daprTestHelpers.js';

const PICTURE_UUID = 'ea1baa90-da2a-4193-8e20-e54f79a8a4dc';
const BASE_PATH = 'ea1baa90/da2a/4193/8e20/e54f79a8a4dc';
const CDN = 'https://resources.tidal.com';

const jsonResponse = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });

/** Answers the Tidal token secret; everything else is left to `route`. */
const installTidalFetch = (
    route: (url: string, init: RequestInit) => Response,
): { calls: string[] } => {
    const calls: string[] = [];
    installFetch((url, init) => {
        calls.push(url);
        if (url.startsWith('http://dapr.test/v1.0/secrets/')) {
            return jsonResponse({ 'tidal-token': 'secret-token' });
        }
        return route(url, init);
    });
    return { calls };
};

const sizeFromCdnCall = (url: string): string => url.slice(url.lastIndexOf('/') + 1, -4);

beforeEach(async () => {
    const { clearDaprSecretCache } =
        await import('../../../src/infrastructure/dapr/daprSecrets.js');
    clearDaprSecretCache();
});

describe('tidalClient', () => {
    describe('extractTidalArtistId', () => {
        it('matches the canonical and browse url shapes', async () => {
            const { extractTidalArtistId } =
                await import('../../../src/services/musicApi/tidalClient.js');

            assert.equal(extractTidalArtistId('https://tidal.com/artist/9706'), '9706');
            assert.equal(extractTidalArtistId('https://www.tidal.com/artist/9706'), '9706');
            assert.equal(extractTidalArtistId('https://tidal.com/browse/artist/9706'), '9706');
            assert.equal(extractTidalArtistId('https://listen.tidal.com/artist/27441'), '27441');
        });

        it('rejects other hosts and non-artist paths', async () => {
            const { extractTidalArtistId } =
                await import('../../../src/services/musicApi/tidalClient.js');

            assert.equal(extractTidalArtistId('https://deezer.com/artist/9706'), null);
            assert.equal(extractTidalArtistId('https://nottidal.com/artist/9706'), null);
            assert.equal(extractTidalArtistId('https://tidal.com/album/9706'), null);
            assert.equal(extractTidalArtistId('not a url'), null);
        });
    });

    describe('buildValidTidalImageUrl', () => {
        it('returns the first size that exists without probing further', async () => {
            const probed: string[] = [];
            installTidalFetch((url) => {
                probed.push(sizeFromCdnCall(url));
                return new Response(null, { status: 200 });
            });

            const { buildValidTidalImageUrl } =
                await import('../../../src/services/musicApi/tidalClient.js');

            assert.equal(
                await buildValidTidalImageUrl(PICTURE_UUID),
                `${CDN}/images/${BASE_PATH}/750x750.jpg`,
            );
            assert.deepEqual(probed, ['750x750']);
        });

        it('skips a size the CDN rejects with 403 and takes the next one', async () => {
            const probed: string[] = [];
            installTidalFetch((url) => {
                const size = sizeFromCdnCall(url);
                probed.push(size);
                // 750x750 is not rendered for every artist; the CDN answers 403
                // AccessDenied rather than 404 in that case.
                return new Response(null, { status: size === '750x750' ? 403 : 200 });
            });

            const { buildValidTidalImageUrl } =
                await import('../../../src/services/musicApi/tidalClient.js');

            assert.equal(
                await buildValidTidalImageUrl(PICTURE_UUID),
                `${CDN}/images/${BASE_PATH}/480x480.jpg`,
            );
            assert.deepEqual(probed, ['750x750', '480x480']);
        });

        it('walks the whole ladder down to a small render', async () => {
            const probed: string[] = [];
            installTidalFetch((url) => {
                const size = sizeFromCdnCall(url);
                probed.push(size);
                return new Response(null, { status: size === '320x320' ? 200 : 403 });
            });

            const { buildValidTidalImageUrl } =
                await import('../../../src/services/musicApi/tidalClient.js');

            assert.equal(
                await buildValidTidalImageUrl(PICTURE_UUID),
                `${CDN}/images/${BASE_PATH}/320x320.jpg`,
            );
            assert.deepEqual(probed, ['750x750', '480x480', '320x320']);
        });

        it('never probes sizes Tidal does not serve', async () => {
            const probed: string[] = [];
            installTidalFetch((url) => {
                probed.push(sizeFromCdnCall(url));
                return new Response(null, { status: 403 });
            });

            const { buildValidTidalImageUrl } =
                await import('../../../src/services/musicApi/tidalClient.js');
            await buildValidTidalImageUrl(PICTURE_UUID);

            // 640x640 and 1280x1280 return 403 for every uuid, so requesting them
            // would only waste probes.
            assert.ok(!probed.includes('640x640'), 'must not probe 640x640');
            assert.ok(!probed.includes('1280x1280'), 'must not probe 1280x1280');
        });

        it('returns null when no size exists', async () => {
            const probed: string[] = [];
            installTidalFetch((url) => {
                probed.push(sizeFromCdnCall(url));
                return new Response(null, { status: 403 });
            });

            const { buildValidTidalImageUrl } =
                await import('../../../src/services/musicApi/tidalClient.js');

            assert.equal(await buildValidTidalImageUrl(PICTURE_UUID), null);
            assert.equal(probed.length, 4);
        });

        it('returns undefined when probes fail transiently', async () => {
            installTidalFetch(() => new Response(null, { status: 503 }));

            const { buildValidTidalImageUrl } =
                await import('../../../src/services/musicApi/tidalClient.js');

            assert.equal(await buildValidTidalImageUrl(PICTURE_UUID), undefined);
        });

        it('prefers a transient result over a confirmed miss', async () => {
            installTidalFetch((url) => {
                const size = sizeFromCdnCall(url);
                // One size is genuinely absent, another failed to answer.
                return new Response(null, { status: size === '750x750' ? 403 : 500 });
            });

            const { buildValidTidalImageUrl } =
                await import('../../../src/services/musicApi/tidalClient.js');

            assert.equal(await buildValidTidalImageUrl(PICTURE_UUID), undefined);
        });

        it('converts the uuid dashes into path segments', async () => {
            const calls: string[] = [];
            installTidalFetch((url) => {
                calls.push(url);
                return new Response(null, { status: 200 });
            });

            const { buildValidTidalImageUrl } =
                await import('../../../src/services/musicApi/tidalClient.js');
            await buildValidTidalImageUrl(PICTURE_UUID);

            assert.equal(
                calls[0],
                `http://dapr.test/v1.0/invoke/tidalimages/method/images/${BASE_PATH}/750x750.jpg`,
            );
        });
    });

    describe('getTidalArtistImage', () => {
        it('sends the secret token and country code to the tidal Dapr endpoint', async () => {
            const { calls } = installTidalFetch((url) =>
                url.includes('/invoke/tidalimages/')
                    ? new Response(null, { status: 200 })
                    : jsonResponse({ id: 9706, name: 'Pink Floyd', picture: PICTURE_UUID }),
            );

            const { getTidalArtistImage } =
                await import('../../../src/services/musicApi/tidalClient.js');
            await getTidalArtistImage(['https://tidal.com/artist/9706']);

            const apiCall = calls.find((url) => url.includes('/invoke/tidal/method/'));
            assert.equal(
                apiCall,
                'http://dapr.test/v1.0/invoke/tidal/method/v1/artists/9706?countryCode=US',
            );
            assert.ok(calls.some((url) => url.endsWith('/secrets/pawify-secrets/tidal-token')));
        });

        it('resolves the picture uuid to a rendered image url', async () => {
            installTidalFetch((url) =>
                url.includes('/invoke/tidalimages/')
                    ? new Response(null, { status: 200 })
                    : jsonResponse({ id: 9706, picture: PICTURE_UUID }),
            );

            const { getTidalArtistImage } =
                await import('../../../src/services/musicApi/tidalClient.js');

            assert.equal(
                await getTidalArtistImage(['https://tidal.com/artist/9706']),
                `${CDN}/images/${BASE_PATH}/750x750.jpg`,
            );
        });

        it('prefers the profile whose name matches MusicBrainz among duplicates', async () => {
            installTidalFetch((url) => {
                if (url.includes('/invoke/tidalimages/')) {
                    return new Response(null, { status: 200 });
                }
                const isFirst = url.includes('/v1/artists/111?');
                return jsonResponse({
                    id: isFirst ? 111 : 222,
                    name: isFirst ? 'Old Name' : 'Saba',
                    picture: PICTURE_UUID,
                });
            });

            const { getTidalArtistImage } =
                await import('../../../src/services/musicApi/tidalClient.js');

            const result = await getTidalArtistImage(
                ['https://tidal.com/artist/111', 'https://tidal.com/artist/222'],
                { artistName: 'Saba' },
            );

            assert.equal(result, `${CDN}/images/${BASE_PATH}/750x750.jpg`);
        });

        it('keeps MusicBrainz order when no name matches', async () => {
            const requested: string[] = [];
            installTidalFetch((url) => {
                if (url.includes('/invoke/tidalimages/')) {
                    return new Response(null, { status: 200 });
                }
                requested.push(url);
                return jsonResponse({ id: 111, name: 'Unrelated', picture: PICTURE_UUID });
            });

            const { getTidalArtistImage } =
                await import('../../../src/services/musicApi/tidalClient.js');

            const result = await getTidalArtistImage(
                ['https://tidal.com/artist/111', 'https://tidal.com/artist/222'],
                { artistName: 'Saba' },
            );

            // Name is only a preference; losing every image would be worse.
            assert.equal(result, `${CDN}/images/${BASE_PATH}/750x750.jpg`);
            assert.equal(requested.length, 2);
        });

        // A stale MusicBrainz Tidal link must not be retried forever.
        it('treats 404 as a confirmed miss, not a transient failure', async () => {
            installTidalFetch(() =>
                jsonResponse(
                    { status: 404, subStatus: 2001, userMessage: 'Artist not found' },
                    404,
                ),
            );

            const { getTidalArtistImage } =
                await import('../../../src/services/musicApi/tidalClient.js');

            assert.equal(await getTidalArtistImage(['https://tidal.com/artist/9706']), null);
        });

        it('treats a revoked token (401) as transient', async () => {
            installTidalFetch(() =>
                jsonResponse({ status: 401, subStatus: 6004, userMessage: 'Invalid token' }, 401),
            );

            const { getTidalArtistImage } =
                await import('../../../src/services/musicApi/tidalClient.js');

            assert.equal(await getTidalArtistImage(['https://tidal.com/artist/9706']), undefined);
        });

        it('treats 429 and 5xx as transient', async () => {
            const { getTidalArtistImage } =
                await import('../../../src/services/musicApi/tidalClient.js');

            installTidalFetch(() => jsonResponse({ error: 'slow down' }, 429));
            assert.equal(await getTidalArtistImage(['https://tidal.com/artist/9706']), undefined);

            installTidalFetch(() => jsonResponse({ error: 'boom' }, 502));
            assert.equal(await getTidalArtistImage(['https://tidal.com/artist/9706']), undefined);
        });

        it('returns null when the artist exists but has no picture', async () => {
            let probedCdn = false;
            installTidalFetch((url) => {
                if (url.includes('/invoke/tidalimages/')) {
                    probedCdn = true;
                }
                return jsonResponse({ id: 9706, name: 'Pink Floyd', picture: null });
            });

            const { getTidalArtistImage } =
                await import('../../../src/services/musicApi/tidalClient.js');

            assert.equal(await getTidalArtistImage(['https://tidal.com/artist/9706']), null);
            assert.equal(probedCdn, false, 'must not probe the CDN without a uuid');
        });

        it('returns null without calling Tidal for a non-Tidal url', async () => {
            let called = false;
            installTidalFetch(() => {
                called = true;
                return jsonResponse({});
            });

            const { getTidalArtistImage } =
                await import('../../../src/services/musicApi/tidalClient.js');

            assert.equal(await getTidalArtistImage(['https://deezer.com/artist/9706']), null);
            assert.equal(called, false);
        });
    });
});
