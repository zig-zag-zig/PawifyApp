import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { installFetch } from '../../helpers/daprTestHelpers.js';

const jsonResponse = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });

describe('deezerClient', () => {
    describe('extractDeezerArtistId', () => {
        it('extracts the id from a canonical Deezer artist url', async () => {
            const { extractDeezerArtistId } =
                await import('../../../src/services/musicApi/deezerClient.js');

            assert.equal(extractDeezerArtistId('https://www.deezer.com/artist/860'), '860');
            assert.equal(extractDeezerArtistId('https://deezer.com/artist/1069'), '1069');
        });

        it('extracts the id from a locale-prefixed url', async () => {
            const { extractDeezerArtistId } =
                await import('../../../src/services/musicApi/deezerClient.js');

            assert.equal(extractDeezerArtistId('https://www.deezer.com/fr/artist/860'), '860');
            assert.equal(extractDeezerArtistId('https://www.deezer.com/en-US/artist/860'), '860');
        });

        it('ignores trailing path segments', async () => {
            const { extractDeezerArtistId } =
                await import('../../../src/services/musicApi/deezerClient.js');

            assert.equal(extractDeezerArtistId('https://www.deezer.com/artist/860/related'), '860');
        });

        it('rejects other hosts, non-artist paths and malformed urls', async () => {
            const { extractDeezerArtistId } =
                await import('../../../src/services/musicApi/deezerClient.js');

            assert.equal(extractDeezerArtistId('https://tidal.com/artist/860'), null);
            assert.equal(extractDeezerArtistId('https://notdeezer.com/artist/860'), null);
            assert.equal(extractDeezerArtistId('https://www.deezer.com/album/860'), null);
            assert.equal(extractDeezerArtistId('https://www.deezer.com/artist/'), null);
            assert.equal(extractDeezerArtistId('not a url'), null);
        });
    });

    describe('getDeezerArtistImage', () => {
        it('prefers the largest render', async () => {
            installFetch(() =>
                jsonResponse({
                    id: 860,
                    name: 'Pink Floyd',
                    picture: 'https://api.deezer.com/artist/860/image',
                    picture_small: 'https://cdn.example/56x56.jpg',
                    picture_medium: 'https://cdn.example/250x250.jpg',
                    picture_big: 'https://cdn.example/500x500.jpg',
                    picture_xl: 'https://cdn.example/1000x1000.jpg',
                }),
            );

            const { getDeezerArtistImage } =
                await import('../../../src/services/musicApi/deezerClient.js');

            assert.equal(
                await getDeezerArtistImage(['https://www.deezer.com/artist/860']),
                'https://cdn.example/1000x1000.jpg',
            );
        });

        it('follows the documented field preference order', async () => {
            // Each case removes the fields preferred above it, pinning the exact
            // order: xl, big, medium, picture, small.
            const { getDeezerArtistImage } =
                await import('../../../src/services/musicApi/deezerClient.js');

            installFetch(() => jsonResponse({ picture_big: 'big.jpg', picture_xl: 'xl.jpg' }));
            assert.equal(await getDeezerArtistImage(['https://www.deezer.com/artist/1']), 'xl.jpg');

            installFetch(() =>
                jsonResponse({
                    picture_medium: 'med.jpg',
                    picture_big: 'big.jpg',
                    picture: 'p.jpg',
                }),
            );
            assert.equal(
                await getDeezerArtistImage(['https://www.deezer.com/artist/1']),
                'big.jpg',
            );

            installFetch(() =>
                jsonResponse({
                    picture: 'picture.jpg',
                    picture_medium: 'med.jpg',
                    picture_small: 's.jpg',
                }),
            );
            assert.equal(
                await getDeezerArtistImage(['https://www.deezer.com/artist/1']),
                'med.jpg',
            );

            installFetch(() => jsonResponse({ picture: 'picture.jpg', picture_small: 's.jpg' }));
            assert.equal(
                await getDeezerArtistImage(['https://www.deezer.com/artist/1']),
                'picture.jpg',
            );

            installFetch(() => jsonResponse({ picture_small: 'small.jpg' }));
            assert.equal(
                await getDeezerArtistImage(['https://www.deezer.com/artist/1']),
                'small.jpg',
            );
        });

        it('falls back to picture_medium when no large render exists', async () => {
            installFetch(() =>
                jsonResponse({
                    picture_medium: 'https://cdn.example/250x250.jpg',
                    picture_small: 'https://cdn.example/56x56.jpg',
                }),
            );

            const { getDeezerArtistImage } =
                await import('../../../src/services/musicApi/deezerClient.js');

            assert.equal(
                await getDeezerArtistImage(['https://www.deezer.com/artist/860']),
                'https://cdn.example/250x250.jpg',
            );
        });

        it('uses the plain picture field when nothing preferred is available', async () => {
            installFetch(() =>
                jsonResponse({
                    picture:
                        'https://cdn-images.dzcdn.net/images/artist/9f3b1c0a2f4e/120x120-000000-80-0-0.jpg',
                }),
            );

            const { getDeezerArtistImage } =
                await import('../../../src/services/musicApi/deezerClient.js');

            assert.equal(
                await getDeezerArtistImage(['https://www.deezer.com/artist/860']),
                'https://cdn-images.dzcdn.net/images/artist/9f3b1c0a2f4e/120x120-000000-80-0-0.jpg',
            );
        });

        it('picks the most popular account when MusicBrainz lists duplicates', async () => {
            // Mirrors a real case: a stub profile with 6 fans and the active one
            // with tens of thousands. Both serve a picture.
            installFetch((url) => {
                if (url.includes('cdn.example')) {
                    return new Response(null, { status: 200 });
                }
                const isStub = url.endsWith('/artist/111');
                return jsonResponse({
                    name: 'Saba',
                    nb_fan: isStub ? 6 : 29404,
                    nb_album: isStub ? 0 : 37,
                    picture_medium: `https://cdn.example/${isStub ? 'stub' : 'active'}/250x250.jpg`,
                });
            });

            const { getDeezerArtistImage } =
                await import('../../../src/services/musicApi/deezerClient.js');

            const result = await getDeezerArtistImage(
                ['https://www.deezer.com/artist/111', 'https://www.deezer.com/artist/222'],
                { artistName: 'Saba' },
            );

            assert.match(String(result), /active/);
        });

        it('breaks a fan-count tie on album count', async () => {
            installFetch((url) => {
                if (url.includes('cdn.example')) {
                    return new Response(null, { status: 200 });
                }
                const isFewAlbums = url.endsWith('/artist/111');
                return jsonResponse({
                    name: 'Artist',
                    nb_fan: 100,
                    nb_album: isFewAlbums ? 2 : 20,
                    picture_medium: `https://cdn.example/${isFewAlbums ? 'few' : 'many'}/250x250.jpg`,
                });
            });

            const { getDeezerArtistImage } =
                await import('../../../src/services/musicApi/deezerClient.js');

            const result = await getDeezerArtistImage([
                'https://www.deezer.com/artist/111',
                'https://www.deezer.com/artist/222',
            ]);

            assert.match(String(result), /many/);
        });

        it('prefers the larger audience even when a different name matches MusicBrainz', async () => {
            installFetch((url) => {
                if (url.includes('cdn.example')) {
                    return new Response(null, { status: 200 });
                }
                const isNamesake = url.endsWith('/artist/111');
                return jsonResponse({
                    // Name matches MusicBrainz but this is a tiny stale profile.
                    name: isNamesake ? 'Saba' : 'Saba (Chicago)',
                    nb_fan: isNamesake ? 25 : 29404,
                    nb_album: isNamesake ? 0 : 37,
                    picture_medium: `https://cdn.example/${isNamesake ? 'stale' : 'active'}/250x250.jpg`,
                });
            });

            const { getDeezerArtistImage } =
                await import('../../../src/services/musicApi/deezerClient.js');

            const result = await getDeezerArtistImage(
                ['https://www.deezer.com/artist/111', 'https://www.deezer.com/artist/222'],
                { artistName: 'Saba' },
            );

            // Audience size measures whether an account is the active profile;
            // a name difference must not outrank that.
            assert.match(String(result), /active/);
        });

        it('uses a MusicBrainz name match to break a tie', async () => {
            installFetch((url) => {
                if (url.includes('cdn.example')) {
                    return new Response(null, { status: 200 });
                }
                const isMatch = url.endsWith('/artist/222');
                return jsonResponse({
                    name: isMatch ? 'Saba' : 'Saba Tribute',
                    nb_fan: 500,
                    nb_album: 5,
                    picture_medium: `https://cdn.example/${isMatch ? 'match' : 'other'}/250x250.jpg`,
                });
            });

            const { getDeezerArtistImage } =
                await import('../../../src/services/musicApi/deezerClient.js');

            const result = await getDeezerArtistImage(
                ['https://www.deezer.com/artist/111', 'https://www.deezer.com/artist/222'],
                { artistName: 'Saba' },
            );

            assert.match(String(result), /match/);
        });

        it('falls back to every candidate when no name matches', async () => {
            installFetch((url) => {
                if (url.includes('cdn.example')) {
                    return new Response(null, { status: 200 });
                }
                return jsonResponse({
                    name: 'Totally Different',
                    nb_fan: url.endsWith('/artist/222') ? 500 : 10,
                    nb_album: 1,
                    picture_medium: `https://cdn.example/${url.endsWith('/artist/222') ? 'bigger' : 'smaller'}/250x250.jpg`,
                });
            });

            const { getDeezerArtistImage } =
                await import('../../../src/services/musicApi/deezerClient.js');

            const result = await getDeezerArtistImage(
                ['https://www.deezer.com/artist/111', 'https://www.deezer.com/artist/222'],
                { artistName: 'Saba' },
            );

            // Name is only a preference; losing every image would be worse.
            assert.match(String(result), /bigger/);
        });

        it('returns null when the artist has no picture at all', async () => {
            installFetch(() => jsonResponse({ id: 860, name: 'Pink Floyd' }));

            const { getDeezerArtistImage } =
                await import('../../../src/services/musicApi/deezerClient.js');

            assert.equal(await getDeezerArtistImage(['https://www.deezer.com/artist/860']), null);
        });

        it('routes the API call through the deezer Dapr endpoint and probes the CDN directly', async () => {
            const calls: string[] = [];
            installFetch((url) => {
                calls.push(url);
                return jsonResponse({ picture_medium: 'https://cdn.example/250x250.jpg' });
            });

            const { getDeezerArtistImage } =
                await import('../../../src/services/musicApi/deezerClient.js');
            await getDeezerArtistImage(['https://www.deezer.com/artist/860']);

            assert.deepEqual(
                calls.filter((url) => url.includes('/invoke/deezer/')),
                ['http://dapr.test/v1.0/invoke/deezer/method/artist/860'],
            );
            // The CDN probe must be a HEAD so no image bytes are transferred.
            assert.ok(
                calls.includes('https://cdn.example/250x250.jpg'),
                'expected the CDN to be probed',
            );
        });

        // Deezer hands out plausible hashes for artists with no artwork, and the
        // CDN answers 302 pointing at the placeholder asset.
        it('rejects an image that redirects to the placeholder', async () => {
            installFetch((url) => {
                if (url.includes('cdn.example')) {
                    return new Response(null, {
                        status: 302,
                        headers: {
                            location:
                                '/images/artist/d41d8cd98f00b204e9800998ecf8427e/250x250-000000-80-0-0.jpg',
                        },
                    });
                }
                return jsonResponse({
                    picture_medium: 'https://cdn.example/bogus/250x250.jpg',
                });
            });

            const { getDeezerArtistImage } =
                await import('../../../src/services/musicApi/deezerClient.js');

            assert.equal(await getDeezerArtistImage(['https://www.deezer.com/artist/860']), null);
        });

        it('accepts an image that redirects somewhere other than the placeholder', async () => {
            installFetch((url) => {
                if (url.includes('cdn.example')) {
                    return new Response(null, {
                        status: 302,
                        headers: { location: '/images/artist/realhash/250x250-000000-80-0-0.jpg' },
                    });
                }
                return jsonResponse({ picture_medium: 'https://cdn.example/250x250.jpg' });
            });

            const { getDeezerArtistImage } =
                await import('../../../src/services/musicApi/deezerClient.js');

            assert.equal(
                await getDeezerArtistImage(['https://www.deezer.com/artist/860']),
                'https://cdn.example/250x250.jpg',
            );
        });

        it('skips a size the CDN cannot serve and takes the next one', async () => {
            installFetch((url) => {
                if (url.includes('cdn.example')) {
                    return new Response(null, { status: url.includes('medium') ? 404 : 200 });
                }
                return jsonResponse({
                    picture_medium: 'https://cdn.example/medium-250x250.jpg',
                    picture_big: 'https://cdn.example/big-500x500.jpg',
                });
            });

            const { getDeezerArtistImage } =
                await import('../../../src/services/musicApi/deezerClient.js');

            assert.equal(
                await getDeezerArtistImage(['https://www.deezer.com/artist/860']),
                'https://cdn.example/big-500x500.jpg',
            );
        });

        it('keeps the image when the probe itself fails', async () => {
            installFetch((url) => {
                if (url.includes('cdn.example')) {
                    throw new TypeError('network down');
                }
                return jsonResponse({ picture_medium: 'https://cdn.example/250x250.jpg' });
            });

            const { getDeezerArtistImage } =
                await import('../../../src/services/musicApi/deezerClient.js');

            // A probe outage must not throw away a real image.
            assert.equal(
                await getDeezerArtistImage(['https://www.deezer.com/artist/860']),
                'https://cdn.example/250x250.jpg',
            );
        });

        // Deezer reports "no such artist" as HTTP 200 with an error body, so this
        // must be a confirmed miss rather than a transient failure.
        it('treats a 200 no-data error body as a confirmed miss', async () => {
            installFetch(() =>
                jsonResponse({ error: { type: 'DataException', message: 'no data', code: 800 } }),
            );

            const { getDeezerArtistImage } =
                await import('../../../src/services/musicApi/deezerClient.js');

            assert.equal(await getDeezerArtistImage(['https://www.deezer.com/artist/1']), null);
        });

        it('treats a 200 quota error as transient and pauses Deezer', async () => {
            installFetch(() =>
                jsonResponse({
                    error: { type: 'Exception', message: 'Quota limit exceeded', code: 4 },
                }),
            );

            const { getDeezerArtistImage } =
                await import('../../../src/services/musicApi/deezerClient.js');
            const { getRateLimiter } =
                await import('../../../src/services/musicApi/rateLimiter.js');

            const before = Date.now();
            assert.equal(
                await getDeezerArtistImage(['https://www.deezer.com/artist/860']),
                undefined,
            );

            // Quota is per IP, so the shared bucket must pause rather than let the
            // remaining artists in the batch fire requests that cannot succeed.
            assert.ok(
                getRateLimiter('deezer').backoffUntil > before + 3000,
                'expected the Deezer bucket to be paused',
            );
        });

        it('treats an unrecognised 200 error body as transient', async () => {
            installFetch(() => jsonResponse({ error: { message: 'quota exceeded', code: 700 } }));

            const { getDeezerArtistImage } =
                await import('../../../src/services/musicApi/deezerClient.js');

            assert.equal(
                await getDeezerArtistImage(['https://www.deezer.com/artist/860']),
                undefined,
            );
        });

        it('treats 404 as a confirmed miss and 429/5xx as transient', async () => {
            const { getDeezerArtistImage } =
                await import('../../../src/services/musicApi/deezerClient.js');

            installFetch(() => jsonResponse({ error: 'not found' }, 404));
            assert.equal(await getDeezerArtistImage(['https://www.deezer.com/artist/860']), null);

            installFetch(() => jsonResponse({ error: 'slow down' }, 429));
            assert.equal(
                await getDeezerArtistImage(['https://www.deezer.com/artist/860']),
                undefined,
            );

            installFetch(() => jsonResponse({ error: 'boom' }, 503));
            assert.equal(
                await getDeezerArtistImage(['https://www.deezer.com/artist/860']),
                undefined,
            );
        });

        it('tries the next url when the first is a confirmed miss', async () => {
            const calls: string[] = [];
            installFetch((url) => {
                calls.push(url);
                return url.endsWith('/artist/1')
                    ? jsonResponse({ error: { message: 'no data', code: 800 } })
                    : jsonResponse({ picture_medium: 'https://cdn.example/second.jpg' });
            });

            const { getDeezerArtistImage } =
                await import('../../../src/services/musicApi/deezerClient.js');

            assert.equal(
                await getDeezerArtistImage([
                    'https://www.deezer.com/artist/1',
                    'https://www.deezer.com/artist/2',
                ]),
                'https://cdn.example/second.jpg',
            );
            assert.equal(calls.filter((url) => url.includes('/invoke/deezer/')).length, 2);
        });

        it('returns null without calling Deezer for a non-Deezer url', async () => {
            let called = false;
            installFetch(() => {
                called = true;
                return jsonResponse({});
            });

            const { getDeezerArtistImage } =
                await import('../../../src/services/musicApi/deezerClient.js');

            assert.equal(await getDeezerArtistImage(['https://tidal.com/artist/860']), null);
            assert.equal(called, false);
        });
    });
});
