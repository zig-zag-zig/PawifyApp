import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import type { Release } from '@pawify/shared';
import { deriveReleaseGroupReleaseListMetadata } from '@pawify/shared';

import { closeMusicDb } from '../../../src/infrastructure/musicDb/musicDbClient.js';
import { getReleaseGroupReleasesFromMirror } from '../../../src/infrastructure/musicDb/musicDbRepositories.js';
import { mapReleaseGroupReleasesList } from '../../../src/services/musicbrainz/releaseQueries.js';
import {
    getCacheKey,
    RELEASE_GROUP_RELEASES_CACHE_SUFFIX,
} from '../../../src/utils/helpers/cacheHelpers.js';
import { cleanupMusicDbFixtures, createMusicDbFixture } from '../../helpers/musicDbFixture.js';

const GROUP_ID = 'group-1';
const RELEASE_CD = 'release-cd';
const RELEASE_BOOTLEG = 'release-bootleg';

const seed = {
    releaseGroups: [{ mbid: GROUP_ID, title: 'Album', first_release_date: '2025-03-14' }],
    releases: [
        {
            mbid: RELEASE_CD,
            title: 'Album',
            date: '2025-03-14',
            disambiguation: null,
            release_group_mbid: GROUP_ID,
            country: 'US',
            status: 'Official',
        },
        {
            mbid: RELEASE_BOOTLEG,
            title: 'Album',
            date: '2025-04-01',
            disambiguation: 'live',
            release_group_mbid: GROUP_ID,
            country: 'GB',
            status: 'Bootleg',
        },
    ],
    media: [
        { release_mbid: RELEASE_CD, position: 1, format: 'CD', track_count: 12, title: '' },
        { release_mbid: RELEASE_CD, position: 2, format: 'DVD', track_count: 2, title: '' },
        { release_mbid: RELEASE_BOOTLEG, position: 1, format: 'CD', track_count: 15, title: '' },
    ],
};

const apiRelease = (overrides: Partial<Release> = {}): Release => ({
    id: RELEASE_CD,
    title: 'Album',
    artistId: 'artist-1',
    date: '2025-03-14',
    date_for_display: '14.03.2025',
    disambiguation: null,
    'release-group': {
        id: GROUP_ID,
        title: 'Album',
        date: '2025-03-14',
        disambiguation: null,
        'primary-type': 'Album',
    },
    'artist-credit': [],
    media: [
        { 'track-count': 12, format: 'CD', position: 1, tracks: [] },
        { 'track-count': 2, format: 'DVD', position: 2, tracks: [] },
    ],
    releaseGroupId: GROUP_ID,
    cover_url: null,
    externalLinks: [],
    barcode: null,
    status: 'Official',
    country: 'US',
    ...overrides,
});

describe('deriveReleaseGroupReleaseListMetadata', () => {
    it('sums media track counts and deduplicates formats', () => {
        assert.deepEqual(
            deriveReleaseGroupReleaseListMetadata({
                media: [
                    { 'track-count': 12, format: 'CD' },
                    { 'track-count': 2, format: 'DVD' },
                    { 'track-count': 1, format: 'CD' },
                ],
            }),
            { trackCount: 15, formats: ['CD', 'DVD'] },
        );
    });

    it('returns a null track count when no media data exists', () => {
        assert.deepEqual(deriveReleaseGroupReleaseListMetadata({ media: [] }), {
            trackCount: null,
            formats: [],
        });
    });
});

describe('release-group release list metadata', () => {
    let fixturePath: string;

    beforeEach(() => {
        closeMusicDb();
        fixturePath = createMusicDbFixture(seed);
        process.env.MUSIC_DB_PATH = fixturePath;
    });

    afterEach(() => {
        closeMusicDb();
        cleanupMusicDbFixtures();
        delete process.env.MUSIC_DB_PATH;
    });

    it('maps the API path to the same shape as the mirror', () => {
        const fromMirror = getReleaseGroupReleasesFromMirror(GROUP_ID);
        const fromApi = mapReleaseGroupReleasesList([
            apiRelease(),
            apiRelease({
                id: RELEASE_BOOTLEG,
                date: '2025-04-01',
                date_for_display: '01.04.2025',
                disambiguation: 'live',
                media: [{ 'track-count': 15, format: 'CD', position: 1, tracks: [] }],
                status: 'Bootleg',
                country: 'GB',
            }),
        ]);

        assert.ok(fromMirror);
        assert.deepEqual(fromApi, fromMirror);
        assert.deepEqual(fromMirror, [
            {
                id: RELEASE_CD,
                title: 'Album',
                date: '2025-03-14',
                trackCount: 14,
                formats: ['CD', 'DVD'],
                country: 'US',
                status: 'Official',
            },
            {
                id: RELEASE_BOOTLEG,
                title: 'Album (live)',
                date: '2025-04-01',
                trackCount: 15,
                formats: ['CD'],
                country: 'GB',
                status: 'Bootleg',
            },
        ]);
    });

    it('never treats an old V2 cache key as the V3 payload', () => {
        assert.equal(RELEASE_GROUP_RELEASES_CACHE_SUFFIX, 'releaseGroupReleasesV3');
        assert.equal(
            getCacheKey(GROUP_ID, RELEASE_GROUP_RELEASES_CACHE_SUFFIX),
            `${GROUP_ID}_releaseGroupReleasesV3`,
        );
        assert.notEqual(
            getCacheKey(GROUP_ID, RELEASE_GROUP_RELEASES_CACHE_SUFFIX),
            `${GROUP_ID}_releaseGroupReleasesV2`,
        );
    });
});