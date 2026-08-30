import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    mapArtistSummaryToProfileImageLookup,
    mapArtistToProfileImageLookup,
} from '../src/features/artists/domain/profileImageLookups.js';

describe('mapArtistSummaryToProfileImageLookup', () => {
    it('maps summary with valid discogsUrls', () => {
        const result = mapArtistSummaryToProfileImageLookup({
            id: 'artist-1',
            name: 'Artist One',
            discogsUrls: [
                'https://discogs.com/artist/1',
                'https://discogs.com/artist/1',
                '',
                'https://discogs.com/artist/2',
            ],
        });

        assert.equal(result.artistId, 'artist-1');
        assert.equal(result.artistName, 'Artist One');
        assert.deepEqual(result.discogsUrls, [
            'https://discogs.com/artist/1',
            'https://discogs.com/artist/2',
        ]);
    });

    it('returns undefined discogsUrls when array is empty after filtering', () => {
        const result = mapArtistSummaryToProfileImageLookup({
            id: 'artist-1',
            discogsUrls: ['', '  '],
        });

        assert.equal(result.artistId, 'artist-1');
        assert.equal(result.discogsUrls, undefined);
    });

    it('returns undefined discogsUrls when field is not an array', () => {
        const result = mapArtistSummaryToProfileImageLookup({
            id: 'artist-1',
            discogsUrls: 'not-an-array' as unknown as string[],
        });

        assert.equal(result.discogsUrls, undefined);
    });

    it('returns undefined discogsUrls when field is missing', () => {
        const result = mapArtistSummaryToProfileImageLookup({
            id: 'artist-1',
        });

        assert.equal(result.discogsUrls, undefined);
    });
});

describe('mapArtistToProfileImageLookup', () => {
    it('maps artist with discogs external links', () => {
        const result = mapArtistToProfileImageLookup('artist-1', {
            id: 'artist-1',
            name: 'Artist One',
            type: 'Group',
            disambiguation: null,
            aliases: [],
            members: [],
            externalLinks: [
                { url: 'https://www.discogs.com/artist/123', type: 'discogs' },
                { url: 'https://musicbrainz.org/artist/abc', type: 'musicbrainz' },
            ],
            lifeSpan: { begin: null, end: null, ended: false },
            beginArea: { name: null },
        } as any);

        assert.equal(result.artistId, 'artist-1');
        assert.equal(result.artistName, 'Artist One');
        assert.ok(Array.isArray(result.discogsUrls));
    });

    it('returns empty array when no discogs links', () => {
        const result = mapArtistToProfileImageLookup('artist-1', {
            id: 'artist-1',
            name: 'Artist One',
            type: 'Group',
            disambiguation: null,
            aliases: [],
            members: [],
            externalLinks: [],
            lifeSpan: { begin: null, end: null, ended: false },
            beginArea: { name: null },
        } as any);

        assert.equal(result.artistId, 'artist-1');
        assert.deepEqual(result.discogsUrls, []);
    });
});
