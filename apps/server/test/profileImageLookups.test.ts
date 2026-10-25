import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ExternalLink, ExternalLinkCategory, ExternalLinkService } from '@pawify/shared';

import {
    mapArtistSummaryToProfileImageLookup,
    mapArtistToProfileImageLookup,
} from '../src/features/artists/domain/profileImageLookups.js';

const externalLink = (
    service: ExternalLinkService,
    url: string,
    category: ExternalLinkCategory = 'streaming',
): ExternalLink => ({ service, label: service, url, icon: service, category });

const makeArtist = (externalLinks: ExternalLink[]) =>
    ({
        id: 'artist-1',
        name: 'Artist One',
        type: 'Group',
        disambiguation: null,
        aliases: [],
        members: [],
        externalLinks,
        lifeSpan: { begin: null, end: null, ended: false },
        beginArea: { name: null },
    }) as any;

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
    it('maps discogs, deezer and tidal external links', () => {
        const result = mapArtistToProfileImageLookup(
            'artist-1',
            makeArtist([
                externalLink('discogs', 'https://www.discogs.com/artist/45467', 'database'),
                externalLink('deezer', 'https://www.deezer.com/artist/860'),
                externalLink('tidal', 'https://tidal.com/artist/9706'),
                externalLink('spotify', 'https://open.spotify.com/artist/0k17h0D3J5VfsdmQ1iZtE9'),
            ]),
        );

        assert.equal(result.artistId, 'artist-1');
        assert.equal(result.artistName, 'Artist One');
        assert.deepEqual(result.discogsUrls, ['https://www.discogs.com/artist/45467']);
        assert.deepEqual(result.deezerUrls, ['https://www.deezer.com/artist/860']);
        assert.deepEqual(result.tidalUrls, ['https://tidal.com/artist/9706']);
    });

    it('leaves a provider undefined when the artist has no link for it', () => {
        const result = mapArtistToProfileImageLookup(
            'artist-1',
            makeArtist([externalLink('deezer', 'https://www.deezer.com/artist/860')]),
        );

        assert.deepEqual(result.deezerUrls, ['https://www.deezer.com/artist/860']);
        assert.equal(result.discogsUrls, undefined);
        assert.equal(result.tidalUrls, undefined);
    });

    it('leaves every provider undefined when there are no external links', () => {
        const result = mapArtistToProfileImageLookup('artist-1', makeArtist([]));

        assert.equal(result.artistId, 'artist-1');
        assert.equal(result.discogsUrls, undefined);
        assert.equal(result.deezerUrls, undefined);
        assert.equal(result.tidalUrls, undefined);
    });

    it('collects every url when a provider is linked more than once', () => {
        const result = mapArtistToProfileImageLookup(
            'artist-1',
            makeArtist([
                externalLink('deezer', 'https://www.deezer.com/artist/860'),
                externalLink('deezer', 'https://www.deezer.com/fr/artist/861'),
            ]),
        );

        assert.deepEqual(result.deezerUrls, [
            'https://www.deezer.com/artist/860',
            'https://www.deezer.com/fr/artist/861',
        ]);
    });
});
