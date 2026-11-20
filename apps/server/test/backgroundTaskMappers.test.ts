import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    mapArtistImageToState,
    normalizeDiscogsUrls,
    dedupeTracks,
} from '../src/services/tasks/backgroundTaskMappers.js';
import type { TrackLyricsRequest } from '../src/utils/types/taskTypes.js';

describe('mapArtistImageToState', () => {
    it('returns persistent state for a valid URL', () => {
        const result = mapArtistImageToState('https://example.com/img.jpg');
        assert.equal(result.url, 'https://example.com/img.jpg');
        assert.equal(result.nextRefetchAt, undefined);
        assert.equal(result.confirmedMiss, undefined);
        assert.ok(typeof result.refreshedAt === 'number');
    });

    it('returns confirmed miss for null', () => {
        const result = mapArtistImageToState(null);
        assert.equal(result.url, null);
        assert.equal(result.confirmedMiss, true);
    });

    it('returns transient state for undefined', () => {
        const result = mapArtistImageToState(undefined);
        assert.equal(result.url, undefined);
        assert.ok(typeof result.nextRefetchAt === 'number');
        assert.ok(result.nextRefetchAt! > Date.now());
    });
});

describe('normalizeDiscogsUrls', () => {
    it('filters non-strings, trims, and deduplicates', () => {
        const result = normalizeDiscogsUrls(['  https://a.com  ', 'https://a.com', 123, '', null]);
        assert.deepEqual(result, ['https://a.com']);
    });

    it('returns empty array for non-array input', () => {
        assert.deepEqual(normalizeDiscogsUrls('not-an-array'), []);
        assert.deepEqual(normalizeDiscogsUrls(null), []);
        assert.deepEqual(normalizeDiscogsUrls(undefined), []);
    });

    it('returns empty array for empty array', () => {
        assert.deepEqual(normalizeDiscogsUrls([]), []);
    });
});

describe('dedupeTracks', () => {
    it('deduplicates by trackId', () => {
        const tracks: TrackLyricsRequest[] = [
            { releaseId: 'r1', trackId: 't1', artistName: 'A', trackName: 'T1' },
            { releaseId: 'r1', trackId: 't1', artistName: 'A', trackName: 'T1' },
            { releaseId: 'r1', trackId: 't2', artistName: 'A', trackName: 'T2' },
        ];

        const result = dedupeTracks(tracks);
        assert.equal(result.length, 2);
        assert.equal(result[0]!.trackId, 't1');
        assert.equal(result[1]!.trackId, 't2');
    });

    it('falls back to artistName::trackName key when trackId is empty', () => {
        const tracks: TrackLyricsRequest[] = [
            { releaseId: 'r1', trackId: '', artistName: 'Artist', trackName: 'Song' },
            { releaseId: 'r1', trackId: '', artistName: 'artist', trackName: 'song' },
        ];

        // Both have the same lowercase normalized key "artist::song"
        const result = dedupeTracks(tracks);
        assert.equal(result.length, 1);
    });
});
