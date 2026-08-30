import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    mapUrlsToExternalLinks,
    mapRelationsToExternalLinks,
} from '../src/utils/helpers/externalLinks.js';

describe('mapUrlsToExternalLinks', () => {
    it('maps known streaming services correctly', () => {
        const links = mapUrlsToExternalLinks([
            'https://open.spotify.com/artist/123',
            'https://music.apple.com/album/456',
            'https://music.youtube.com/watch?v=abc',
        ]);

        assert.equal(links.length, 3);
        assert.equal(links[0]!.service, 'spotify');
        assert.equal(links[0]!.category, 'streaming');
        assert.equal(links[1]!.service, 'appleMusic');
        assert.equal(links[2]!.service, 'youtubeMusic');
    });

    it('maps social media URLs', () => {
        const links = mapUrlsToExternalLinks([
            'https://instagram.com/artist',
            'https://x.com/artist',
            'https://twitter.com/artist',
        ]);

        assert.equal(links.length, 3);
        assert.equal(links[0]!.service, 'instagram');
        assert.equal(links[0]!.category, 'social');
        assert.equal(links[1]!.service, 'x');
        // twitter.com also maps to x service
        assert.equal(links[2]!.service, 'x');
    });

    it('maps unknown URLs to service: other with label from hostname', () => {
        const links = mapUrlsToExternalLinks(['https://my-band.example.com/page']);

        assert.equal(links.length, 1);
        assert.equal(links[0]!.service, 'other');
        assert.equal(links[0]!.category, 'other');
    });

    it('deduplicates duplicate URLs', () => {
        const links = mapUrlsToExternalLinks([
            'https://open.spotify.com/artist/123',
            'https://open.spotify.com/artist/123',
        ]);

        assert.equal(links.length, 1);
    });

    it('filters out empty strings', () => {
        const links = mapUrlsToExternalLinks(['', '  ']);

        assert.equal(links.length, 0);
    });

    it('normalizes bare hostnames with https prefix', () => {
        const links = mapUrlsToExternalLinks(['example.com']);

        assert.equal(links.length, 1);
        assert.ok(links[0]!.url.startsWith('https://'));
    });

    it('handles subdomain matching (e.g., music.youtube.com)', () => {
        const links = mapUrlsToExternalLinks(['https://music.youtube.com/watch?v=abc']);

        assert.equal(links[0]!.service, 'youtubeMusic');
        assert.equal(links[0]!.label, 'YouTube Music');
    });

    it('matches Bandcamp', () => {
        const links = mapUrlsToExternalLinks(['https://artist.bandcamp.com']);

        assert.equal(links[0]!.service, 'bandcamp');
    });
});

describe('mapRelationsToExternalLinks', () => {
    it('maps MusicBrainz relation format to ExternalLink', () => {
        const relations = [
            {
                type: 'official homepage',
                url: [{ resource: 'https://example.com' }],
            },
        ];

        const links = mapRelationsToExternalLinks(relations);

        assert.equal(links.length, 1);
        assert.equal(links[0]!.service, 'official');
        assert.equal(links[0]!.category, 'official');
    });

    it('handles relations with multiple URLs', () => {
        const relations = [
            {
                type: 'social network',
                url: [
                    { resource: 'https://instagram.com/artist' },
                    { resource: 'https://twitter.com/artist' },
                ],
            },
        ];

        const links = mapRelationsToExternalLinks(relations);

        assert.equal(links.length, 2);
        assert.equal(links[0]!.service, 'instagram');
        assert.equal(links[1]!.service, 'x');
    });

    it('returns empty array for undefined relations', () => {
        assert.deepEqual(mapRelationsToExternalLinks(undefined), []);
    });

    it('returns empty array for empty relations', () => {
        assert.deepEqual(mapRelationsToExternalLinks([]), []);
    });

    it('filters out relations with no URL resource', () => {
        const relations = [
            { type: 'test', url: [] },
            { type: 'test', url: [{ resource: 'https://spotify.com/artist/1' }] },
        ];

        const links = mapRelationsToExternalLinks(relations);

        assert.equal(links.length, 1);
        assert.equal(links[0]!.service, 'spotify');
    });
});
