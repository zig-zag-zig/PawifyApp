import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    shouldRefetchState,
    mapArtistImageToState,
    normalizeDiscogsUrls,
    canonicalDiscogsUrls,
    dedupeTracks,
    hasLegacyArtistImageFields,
    normalizeArtistImageState,
} from '../src/services/tasks/backgroundTaskMappers.js';
import type { TrackLyricsRequest } from '../src/utils/types/taskTypes.js';
import type { CachedArtistImage } from '../src/utils/types/cacheTypes.js';

describe('shouldRefetchState', () => {
    it('returns true for undefined state', () => {
        assert.equal(shouldRefetchState(undefined), true);
    });

    it('returns true when url is not a valid RemoteValueState type', () => {
        assert.equal(shouldRefetchState({ url: 123 as any }), true);
    });

    it('returns true when url is null without confirmedMiss', () => {
        assert.equal(shouldRefetchState({ url: null }), true);
    });

    it('returns false when url is null with confirmedMiss: true', () => {
        assert.equal(shouldRefetchState({ url: null, confirmedMiss: true }), false);
    });

    it('returns false for a valid url and no nextRefetchAt', () => {
        assert.equal(shouldRefetchState({ url: 'https://example.com/img.jpg' }), false);
    });
});

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

describe('canonicalDiscogsUrls', () => {
    it('sorts URLs alphabetically and joins with pipe', () => {
        assert.equal(
            canonicalDiscogsUrls(['https://c.com', 'https://a.com', 'https://b.com']),
            'https://a.com|https://b.com|https://c.com',
        );
    });

    it('returns empty string for empty array', () => {
        assert.equal(canonicalDiscogsUrls([]), '');
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

describe('hasLegacyArtistImageFields', () => {
    it('returns true when refreshedAt is missing', () => {
        assert.equal(hasLegacyArtistImageFields({ url: 'https://a.com' } as any), true);
    });

    it('returns true when url is not a valid RemoteValueState', () => {
        assert.equal(hasLegacyArtistImageFields({ url: 123, refreshedAt: 100 } as any), true);
    });

    it('returns true when artistName field is present', () => {
        assert.equal(
            hasLegacyArtistImageFields({
                url: undefined,
                refreshedAt: 100,
                artistName: 'x',
            } as any),
            true,
        );
    });

    it('returns true when discogsUrls field is present', () => {
        assert.equal(
            hasLegacyArtistImageFields({
                url: undefined,
                refreshedAt: 100,
                discogsUrls: [],
            } as any),
            true,
        );
    });

    it('returns false for a clean state', () => {
        const state: CachedArtistImage = {
            url: 'https://example.com/img.jpg',
            refreshedAt: 100,
        };
        assert.equal(hasLegacyArtistImageFields(state), false);
    });
});

describe('normalizeArtistImageState', () => {
    it('normalizes a clean state', () => {
        const result = normalizeArtistImageState({
            url: 'https://example.com/img.jpg',
            nextRefetchAt: undefined,
            confirmedMiss: undefined,
            refreshedAt: 100,
        });
        assert.equal(result.url, 'https://example.com/img.jpg');
        assert.equal(result.refreshedAt, 100);
    });

    it('normalizes invalid url to undefined', () => {
        const result = normalizeArtistImageState({ url: 123 as any });
        assert.equal(result.url, undefined);
    });
});
