import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    partitionArtistProfileImages,
    partitionArtistReleaseGroupCovers,
    partitionReleaseGroupReleaseCovers,
    partitionTrackLyrics,
} from '../src/services/cache/partitionCachedAssets.js';
import type { CachedArtistImage } from '../src/utils/types/cacheTypes.js';
import type {
    ArtistProfileImageLookup,
    ReleaseGroupPageEntry,
    ReleaseGroupReleasesPageEntry,
    TrackLyricsRequest,
} from '../src/utils/types/taskTypes.js';

type StubCache = Record<string, unknown>;

const createStubReader =
    (cache: StubCache) =>
    async <T>(key: string): Promise<T | null> => {
        return (cache[key] as T | undefined) ?? null;
    };

const usableImage = (url: string): CachedArtistImage => ({
    url,
    nextRefetchAt: undefined,
    refreshedAt: Date.now(),
});

const confirmedNullImage = (): CachedArtistImage => ({
    url: null,
    confirmedMiss: true,
    refreshedAt: Date.now(),
});

const transientImage = (): CachedArtistImage => ({
    url: undefined,
    nextRefetchAt: Date.now() + 60_000,
    refreshedAt: Date.now(),
});

const imageCacheKey = (artistId: string): string => `${artistId}_artistImages`;
const lyricsCacheKey = (releaseId: string): string => `${releaseId}_releaseLyrics`;
const releaseCoversCacheKey = (releaseGroupId: string): string =>
    `${releaseGroupId}_releaseGroupReleaseCovers`;
const artistCoverCacheKey = (artistId: string): string => `${artistId}_artistReleaseGroupCovers`;

describe('partitionCachedAssets', () => {
    describe('partitionArtistProfileImages', () => {
        const lookups: ArtistProfileImageLookup[] = [
            { artistId: 'artist-hit', artistName: 'Hit' },
            { artistId: 'artist-null', artistName: 'Null' },
            { artistId: 'artist-transient', artistName: 'Transient' },
            { artistId: 'artist-miss', artistName: 'Miss' },
        ];

        it('resolves cached URL strings and confirmed nulls, keeps the rest pending', async () => {
            const cache: StubCache = {
                [imageCacheKey('artist-hit')]: usableImage('https://img.example/hit.jpg'),
                [imageCacheKey('artist-null')]: confirmedNullImage(),
                [imageCacheKey('artist-transient')]: transientImage(),
            };

            const result = await partitionArtistProfileImages(lookups, createStubReader(cache));

            assert.deepEqual(result.resolved, {
                'artist-hit': 'https://img.example/hit.jpg',
                'artist-null': null,
            });
            assert.deepEqual(
                result.pending.map((lookup) => lookup.artistId),
                ['artist-transient', 'artist-miss'],
            );
        });

        it('treats cache read failures as pending (fail open)', async () => {
            const result = await partitionArtistProfileImages(lookups, async () => {
                throw new Error('cache unavailable');
            });

            assert.deepEqual(result.resolved, {});
            assert.equal(result.pending.length, lookups.length);
        });

        it('drops lookups without an artist id into pending', async () => {
            const result = await partitionArtistProfileImages(
                [{ artistId: '', artistName: 'No Id' }],
                createStubReader({}),
            );

            assert.deepEqual(result.resolved, {});
            assert.equal(result.pending.length, 1);
        });
    });

    describe('partitionTrackLyrics', () => {
        const tracks: TrackLyricsRequest[] = [
            { releaseId: 'release-1', trackId: 'track-hit', artistName: 'A', trackName: 'Song 1' },
            { releaseId: 'release-1', trackId: 'track-null', artistName: 'A', trackName: 'Song 2' },
            { releaseId: 'release-1', trackId: 'track-miss', artistName: 'A', trackName: 'Song 3' },
        ];

        it('resolves cached lyric URLs and confirmed nulls', async () => {
            const cache: StubCache = {
                [lyricsCacheKey('release-1')]: {
                    'track-hit': { url: 'https://lyrics.example/hit', confirmedMiss: false },
                    'track-null': { url: null, confirmedMiss: true },
                },
            };

            const result = await partitionTrackLyrics('release-1', tracks, createStubReader(cache));

            assert.deepEqual(result.resolved, {
                'track-hit': 'https://lyrics.example/hit',
                'track-null': null,
            });
            assert.deepEqual(
                result.pending.map((track) => track.trackId),
                ['track-miss'],
            );
        });

        it('treats lyrics cache read failures as pending (fail open)', async () => {
            const result = await partitionTrackLyrics('release-1', tracks, async () => {
                throw new Error('cache unavailable');
            });

            assert.deepEqual(result.resolved, {});
            assert.equal(result.pending.length, tracks.length);
        });
    });

    describe('partitionReleaseGroupReleaseCovers', () => {
        const entries: ReleaseGroupReleasesPageEntry[] = [
            { releaseGroupId: 'rg-1', releaseIds: ['r-hit', 'r-miss'] },
            { releaseGroupId: 'rg-2', releaseIds: ['r-null'] },
        ];

        it('resolves cached cover URLs and confirmed nulls, keeps only unresolved release ids pending', async () => {
            const cache: StubCache = {
                [releaseCoversCacheKey('rg-1')]: {
                    'r-hit': { url: 'https://cover.example/r-hit.jpg' },
                },
                [releaseCoversCacheKey('rg-2')]: {
                    'r-null': { url: null, confirmedMiss: true },
                },
            };

            const result = await partitionReleaseGroupReleaseCovers(
                entries,
                createStubReader(cache),
            );

            assert.deepEqual(result.resolved, {
                'r-hit': 'https://cover.example/r-hit.jpg',
                'r-null': null,
            });
            assert.deepEqual(result.pending, [{ releaseGroupId: 'rg-1', releaseIds: ['r-miss'] }]);
        });

        it('treats cover cache read failures as pending (fail open)', async () => {
            const result = await partitionReleaseGroupReleaseCovers(entries, async () => {
                throw new Error('cache unavailable');
            });

            assert.deepEqual(result.resolved, {});
            assert.equal(result.pending.length, 2);
        });

        it('returns empty pending when every entry is resolved', async () => {
            const cache: StubCache = {
                [releaseCoversCacheKey('rg-1')]: {
                    'r-hit': { url: 'https://cover.example/a.jpg' },
                    'r-miss': { url: 'https://cover.example/b.jpg' },
                },
            };

            const result = await partitionReleaseGroupReleaseCovers(
                [{ releaseGroupId: 'rg-1', releaseIds: ['r-hit', 'r-miss'] }],
                createStubReader(cache),
            );

            assert.deepEqual(result.resolved, {
                'r-hit': 'https://cover.example/a.jpg',
                'r-miss': 'https://cover.example/b.jpg',
            });
            assert.deepEqual(result.pending, []);
        });
    });

    describe('partitionArtistReleaseGroupCovers', () => {
        const entries: ReleaseGroupPageEntry[] = [
            { releaseGroupId: 'rg-1', releaseIds: ['r1', 'r2'] },
            { releaseGroupId: 'rg-2', releaseIds: ['r3'] },
        ];

        it('resolves cached artist release-group covers', async () => {
            const cache: StubCache = {
                [artistCoverCacheKey('artist-1')]: {
                    'rg-1': { url: 'https://cover.example/rg-1.jpg' },
                },
            };

            const result = await partitionArtistReleaseGroupCovers(
                'artist-1',
                entries,
                createStubReader(cache),
            );

            assert.deepEqual(result.resolved, {
                'rg-1': 'https://cover.example/rg-1.jpg',
            });
            assert.deepEqual(result.pending, [{ releaseGroupId: 'rg-2', releaseIds: ['r3'] }]);
        });

        it('treats artist cover cache read failures as pending (fail open)', async () => {
            const result = await partitionArtistReleaseGroupCovers(
                'artist-1',
                entries,
                async () => {
                    throw new Error('cache unavailable');
                },
            );

            assert.deepEqual(result.resolved, {});
            assert.equal(result.pending.length, 2);
        });
    });
});
