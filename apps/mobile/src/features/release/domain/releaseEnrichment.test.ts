import { describe, expect, it } from 'vitest';
import type { Release } from '@pawify/shared';

import {
    collectArtistImagesForRelease,
    collectTrackLyricsForRelease,
    flattenReleaseTracks,
} from './releaseEnrichment';

const release = (): Release => ({
    id: 'release-1',
    title: 'Release',
    date: '2026-01-01',
    disambiguation: null,
    artistId: 'artist-main',
    date_for_display: '01.01.2026',
    'release-group': null,
    'artist-credit': [
        { id: 'artist-main', name: 'Main Artist', joinphrase: null },
    ],
    media: [
        {
            'track-count': 2,
            tracks: [
                {
                    id: 'track-1',
                    title: 'Intro',
                    'artist-credit': [
                        { id: 'artist-main', name: 'Main Artist', joinphrase: null },
                    ],
                    length: null,
                },
                {
                    id: 'track-2',
                    title: 'Feature',
                    'artist-credit': [
                        { id: 'artist-feature', name: 'Feature Artist', joinphrase: null },
                    ],
                    length: 180000,
                },
            ],
        },
        {
            'track-count': 0,
            tracks: null,
        },
    ],
    releaseGroupId: null,
    cover_url: null,
    externalLinks: [],
});

describe('release enrichment helpers', () => {
    it('flattens track lists while skipping media without loaded tracks', () => {
        expect(flattenReleaseTracks(release()).map(track => track.id)).toEqual([
            'track-1',
            'track-2',
        ]);
    });

    it('collects only cached lyrics for tracks on the release', () => {
        expect(collectTrackLyricsForRelease(release(), {
            'track-1': 'Lyrics',
            'track-2': null,
            'track-outside-release': 'Ignored',
        })).toEqual({
            'track-1': 'Lyrics',
            'track-2': null,
        });
    });

    it('collects release and track artist images from the cache', () => {
        expect(collectArtistImagesForRelease(release(), {
            'artist-main': 'https://example.test/main.jpg',
            'artist-feature': null,
            'artist-outside-release': 'https://example.test/ignored.jpg',
        })).toEqual({
            'artist-main': 'https://example.test/main.jpg',
            'artist-feature': null,
        });
    });
});
