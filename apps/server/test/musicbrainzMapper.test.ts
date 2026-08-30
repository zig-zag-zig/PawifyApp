import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    mapToArtist,
    mapToRelease,
    mapToNewRelease,
    mapToReleaseResult,
} from '../src/infrastructure/musicbrainz/musicbrainzMapper.js';

const makeMbArtist = (overrides: Record<string, unknown> = {}) => ({
    id: 'artist-1',
    name: 'Test Artist',
    type: 'Group',
    disambiguation: 'from Berlin',
    aliases: [{ name: 'Alias 1' }, { name: 'Alias 2' }],
    'life-span': { begin: '2000-01-01', end: null, ended: false },
    'begin-area': { name: 'Berlin' },
    relations: [
        {
            type: 'official homepage',
            url: [{ resource: 'https://example.com' }],
        },
        {
            type: 'member of band',
            artist: { id: 'member-1', name: 'Member One', type: 'Person' },
            begin: '2000',
            end: null,
            direction: 'forward',
        },
    ],
    ...overrides,
});

const makeMbRelease = (overrides: Record<string, unknown> = {}) => ({
    id: 'release-1',
    title: 'Test Release',
    date: '2026-01-15',
    disambiguation: 'deluxe edition',
    'artist-credit': [{ artist: { id: 'artist-1', name: 'Artist One' }, joinphrase: '' }],
    media: [
        {
            'track-count': 2,
            tracks: [
                { id: 'track-1', title: 'Track One', 'artist-credit': [], length: 180000 },
                { id: 'track-2', title: 'Track Two', 'artist-credit': [], length: 240000 },
            ],
        },
    ],
    'release-group': {
        id: 'rg-1',
        title: 'Test Release Group',
        'primary-type': 'Album',
        'first-release-date': '2025-06-01',
        disambiguation: null,
    },
    relations: [
        {
            type: 'amazon asin',
            url: [{ resource: 'https://amazon.com/dp/B001' }],
        },
    ],
    ...overrides,
});

describe('mapToArtist', () => {
    it('maps a full MusicBrainz artist response', () => {
        const result = mapToArtist(makeMbArtist());

        assert.equal(result.id, 'artist-1');
        assert.equal(result.name, 'Test Artist');
        assert.equal(result.type, 'Group');
        assert.equal(result.disambiguation, 'from Berlin');
        assert.equal(result.aliases.length, 2);
        assert.equal(result.aliases[0]!.name, 'Alias 1');
        assert.equal(result.lifeSpan.begin, '2000-01-01');
        assert.equal(result.lifeSpan.end, null);
        assert.equal(result.lifeSpan.ended, false);
        assert.equal(result.beginArea.name, 'Berlin');
    });

    it('maps members from relations', () => {
        const result = mapToArtist(makeMbArtist());

        assert.equal(result.members.length, 1);
        assert.equal(result.members[0]!.id, 'member-1');
        assert.equal(result.members[0]!.name, 'Member One');
        assert.equal(result.members[0]!.type, 'member of band');
        assert.equal(result.members[0]!.direction, 'forward');
    });

    it('handles missing optional fields', () => {
        const result = mapToArtist(
            makeMbArtist({
                disambiguation: undefined,
                aliases: undefined,
                'life-span': undefined,
                'begin-area': undefined,
                relations: [],
            }),
        );

        assert.equal(result.disambiguation, null);
        assert.deepEqual(result.aliases, []);
        assert.equal(result.lifeSpan.begin, null);
        assert.equal(result.beginArea.name, null);
        assert.deepEqual(result.members, []);
    });
});

describe('mapToRelease', () => {
    it('maps a full MusicBrainz release response', () => {
        const result = mapToRelease(makeMbRelease());

        assert.equal(result.id, 'release-1');
        assert.equal(result.title, 'Test Release');
        assert.equal(result.date, '2026-01-15');
        assert.equal(result.disambiguation, 'deluxe edition');
        assert.equal(result.date_for_display, '15.01.2026');
        assert.equal(result.artistId, 'artist-1');
    });

    it('maps release-group', () => {
        const result = mapToRelease(makeMbRelease());

        assert.ok(result['release-group']);
        assert.equal(result['release-group']!.id, 'rg-1');
        assert.equal(result['release-group']!['primary-type'], 'Album');
        assert.equal(result['release-group']!.date, '2025-06-01');
        assert.equal(result.releaseGroupId, 'rg-1');
    });

    it('filters out media with no tracks', () => {
        const result = mapToRelease(
            makeMbRelease({
                media: [
                    { 'track-count': 0, tracks: null },
                    {
                        'track-count': 2,
                        tracks: [{ id: 't1', title: 'T1', 'artist-credit': [], length: null }],
                    },
                ],
            }),
        );

        assert.equal(result.media.length, 1);
        assert.equal(result.media[0]!.tracks!.length, 1);
    });

    it('handles missing optional fields gracefully', () => {
        const result = mapToRelease(
            makeMbRelease({
                date: undefined,
                disambiguation: undefined,
                'release-group': undefined,
                media: [],
                relations: undefined,
            }),
        );

        assert.equal(result.date, null);
        assert.equal(result.disambiguation, null);
        assert.equal(result['release-group'], null);
        assert.equal(result.releaseGroupId, null);
        assert.deepEqual(result.media, []);
        assert.equal(result.date_for_display, 'Unknown date');
    });

    it('uses the provided artistId when given', () => {
        const result = mapToRelease(makeMbRelease(), 'override-artist');
        assert.equal(result.artistId, 'override-artist');
    });
});

describe('mapToNewRelease', () => {
    it('maps a Release to a NewRelease', () => {
        const release = mapToRelease(makeMbRelease());
        const newRelease = mapToNewRelease(release);

        assert.equal(newRelease.id, 'release-1');
        assert.equal(newRelease.title, 'Test Release');
        assert.equal(newRelease.date, '2026-01-15');
        assert.equal(newRelease.disambiguation, 'deluxe edition');
        assert.equal(newRelease.date_for_display, '15.01.2026');
        assert.equal(newRelease['primary-type'], 'Album');
        assert.equal(newRelease.artists['artist-1'], 'Artist One');
    });

    it('falls back to null primary-type when release-group is missing', () => {
        const release = mapToRelease(makeMbRelease({ 'release-group': undefined }));
        const newRelease = mapToNewRelease(release);

        assert.equal(newRelease['primary-type'], null);
    });
});

describe('mapToReleaseResult', () => {
    it('maps a paginated response', () => {
        const result = mapToReleaseResult({
            releases: [makeMbRelease(), makeMbRelease({ id: 'release-2' })],
            'release-count': 42,
        });

        assert.equal(result.releases.length, 2);
        assert.equal(result.releases[0]!.id, 'release-1');
        assert.equal(result.releases[1]!.id, 'release-2');
        assert.equal(result['release-count'], 42);
    });

    it('handles missing releases array', () => {
        const result = mapToReleaseResult({ 'release-count': 0 });
        assert.deepEqual(result.releases, []);
        assert.equal(result['release-count'], 0);
    });
});
