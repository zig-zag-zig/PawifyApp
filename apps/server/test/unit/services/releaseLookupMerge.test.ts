import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Release } from '@pawify/shared';

import { mergeReleaseMetadata } from '../../../src/services/musicbrainz/releaseLookup.js';

const apiRelease = (overrides: Partial<Release> = {}): Release => ({
    id: 'release-1',
    title: 'Hunger for More',
    artistId: 'artist-api',
    date: '2003-04-29',
    date_for_display: '29 April 2003',
    disambiguation: null,
    releaseGroupId: 'group-api',
    'release-group': {
        id: 'group-api',
        title: 'Hunger for More',
        'primary-type': 'Album',
        date: '2003-04-29',
        disambiguation: null,
    },
    'artist-credit': [{ id: 'artist-api', name: 'Lloyd Banks', joinphrase: null }],
    media: [{ 'track-count': 0, tracks: [] }],
    cover_url: null,
    externalLinks: [
        {
            url: 'https://api.example',
            service: 'official',
            label: 'Website',
            icon: 'official',
            category: 'official',
        },
    ],
    ...overrides,
});

const mirrorMetadata = (
    overrides: Partial<Omit<Release, 'media' | 'cover_url'>> = {},
): Omit<Release, 'media' | 'cover_url'> => ({
    id: 'release-1',
    title: 'Hunger for More',
    artistId: 'artist-mirror',
    date: '2003-04-29',
    date_for_display: '29 April 2003',
    disambiguation: 'explicit',
    releaseGroupId: 'group-mirror',
    'release-group': {
        id: 'group-mirror',
        title: 'Hunger for More',
        'primary-type': 'Album',
        date: '2003-04-29',
        disambiguation: null,
    },
    'artist-credit': [{ id: 'artist-mirror', name: 'Lloyd Banks', joinphrase: null }],
    externalLinks: [],
    ...overrides,
});

describe('mergeReleaseMetadata', () => {
    it('keeps the API tracklist untouched', () => {
        const merged = mergeReleaseMetadata(apiRelease(), mirrorMetadata());

        assert.deepEqual(merged.media, [{ 'track-count': 0, tracks: [] }]);
    });

    it('prefers the mirror disambiguation the API did not return', () => {
        const merged = mergeReleaseMetadata(apiRelease(), mirrorMetadata());

        assert.equal(merged.disambiguation, 'explicit');
    });

    it('keeps the API release group when it disagrees with the mirror', () => {
        // The mirror can be up to an hour behind; navigation must follow the data
        // fetched for this exact release.
        const merged = mergeReleaseMetadata(apiRelease(), mirrorMetadata());

        assert.equal(merged.releaseGroupId, 'group-api');
        assert.equal(merged['release-group']?.id, 'group-api');
    });

    it('falls back to mirror release-group data when the API omits it', () => {
        const merged = mergeReleaseMetadata(
            apiRelease({ 'release-group': null, releaseGroupId: null }),
            mirrorMetadata(),
        );

        assert.equal(merged.releaseGroupId, 'group-mirror');
        assert.equal(merged['release-group']?.id, 'group-mirror');
    });

    it('keeps API credits when the mirror has none', () => {
        const merged = mergeReleaseMetadata(apiRelease(), mirrorMetadata({ 'artist-credit': [] }));

        assert.deepEqual(
            merged['artist-credit'].map((credit) => credit.name),
            ['Lloyd Banks'],
        );
    });

    it('uses mirror credits when the API returned none', () => {
        const merged = mergeReleaseMetadata(apiRelease({ 'artist-credit': [] }), mirrorMetadata());

        assert.deepEqual(
            merged['artist-credit'].map((credit) => credit.id),
            ['artist-mirror'],
        );
    });

    it('keeps API external links when the mirror has none', () => {
        const merged = mergeReleaseMetadata(apiRelease(), mirrorMetadata());

        assert.deepEqual(
            merged.externalLinks.map((link) => link.url),
            ['https://api.example'],
        );
    });

    it('does not blank the title or date with an empty mirror value', () => {
        const merged = mergeReleaseMetadata(
            apiRelease({ date: '2003-04-29' }),
            mirrorMetadata({ title: '', date: null }),
        );

        assert.equal(merged.title, 'Hunger for More');
        assert.equal(merged.date, '2003-04-29');
    });
});
