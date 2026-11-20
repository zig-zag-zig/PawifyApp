import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const DEEZER_ALBUM = 'https://www.deezer.com/album/1110718732';
const TIDAL_ALBUM = 'https://tidal.com/album/566586812';

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

    it('falls back to the host when a link was not classified', async () => {
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
