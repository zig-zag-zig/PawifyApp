import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    collectReleaseArtistIds,
    collectTrackLyricsRequests,
    getNewReleaseCoverDedupeKey,
} from '../../../src/features/releases/domain/releaseTaskPayloads.js';

describe('releaseTaskPayloads', () => {
    describe('getNewReleaseCoverDedupeKey', () => {
        it('generates a deterministic sorted key', () => {
            const entries = [
                { releaseGroupId: 'rg-2', releaseIds: ['r3'] },
                { releaseGroupId: 'rg-1', releaseIds: ['r1', 'r2'] },
            ];

            const key = getNewReleaseCoverDedupeKey(entries);
            assert.equal(key, 'new_release_covers:rg-1:r1,rg-1:r2,rg-2:r3');
        });

        it('deduplicates duplicate entries in input', () => {
            const entries = [
                { releaseGroupId: 'rg-1', releaseIds: ['r1'] },
                { releaseGroupId: 'rg-1', releaseIds: ['r1'] },
            ];

            const key = getNewReleaseCoverDedupeKey(entries);
            assert.equal(key, 'new_release_covers:rg-1:r1');
        });

        it('returns stable key for empty input', () => {
            assert.equal(getNewReleaseCoverDedupeKey([]), 'new_release_covers:');
        });
    });

    describe('collectReleaseArtistIds', () => {
        it('collects artist IDs from artist-credit and track artist-credits', () => {
            const release = {
                id: 'release-1',
                'artist-credit': [{ id: 'artist-1', name: 'Main Artist', joinphrase: null }],
                media: [
                    {
                        'track-count': 1,
                        tracks: [
                            {
                                id: 'track-1',
                                title: 'Track',
                                'artist-credit': [
                                    { id: 'artist-2', name: 'Feature', joinphrase: null },
                                ],
                                length: null,
                            },
                        ],
                    },
                ],
            };

            const ids = collectReleaseArtistIds(release as any);
            assert.deepEqual(ids.sort(), ['artist-1', 'artist-2']);
        });

        it('returns empty array for release with no artist credits', () => {
            const release = { id: 'release-1', 'artist-credit': [], media: [] };
            const ids = collectReleaseArtistIds(release as any);
            assert.deepEqual(ids, []);
        });
    });

    describe('collectTrackLyricsRequests', () => {
        it('collects lyrics requests from release media', () => {
            const release = {
                id: 'release-1',
                'artist-credit': [{ id: 'artist-1', name: 'Band', joinphrase: null }],
                media: [
                    {
                        'track-count': 2,
                        tracks: [
                            { id: 'track-1', title: 'Song 1', 'artist-credit': [], length: null },
                            {
                                id: 'track-2',
                                title: 'Song 2',
                                'artist-credit': [
                                    { id: 'artist-2', name: 'Feat', joinphrase: null },
                                ],
                                length: null,
                            },
                        ],
                    },
                ],
            };

            const requests = collectTrackLyricsRequests(release as any);
            assert.equal(requests.length, 2);
            assert.equal(requests[0]!.trackId, 'track-1');
            assert.equal(requests[0]!.artistName, 'Band');
            assert.equal(requests[0]!.trackName, 'Song 1');
            assert.equal(requests[1]!.artistName, 'Feat');
        });

        it('skips tracks with no artist name or title', () => {
            const release = {
                id: 'release-1',
                'artist-credit': [],
                media: [
                    {
                        'track-count': 1,
                        tracks: [
                            { id: 'track-1', title: '', 'artist-credit': [], length: null },
                            {
                                id: 'track-2',
                                title: 'Valid',
                                'artist-credit': [{ id: 'a', name: 'Band', joinphrase: null }],
                                length: null,
                            },
                        ],
                    },
                ],
            };

            const requests = collectTrackLyricsRequests(release as any);
            assert.equal(requests.length, 1);
            assert.equal(requests[0]!.trackId, 'track-2');
        });
    });
});
