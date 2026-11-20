import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import Database from 'better-sqlite3';

import { closeMusicDb, getMusicDb } from '../../../src/infrastructure/musicDb/musicDbClient.js';
import {
    countArtistNotificationReleasesUpTo,
    readArtistNotificationCatalogRows,
} from '../../../src/infrastructure/musicDb/musicDbQueries.js';
import { getArtistReleaseGroupCatalog } from '../../../src/services/musicbrainz/artistReleaseGroupCatalog.js';
import { buildArtistNotificationCatalogFromRows } from '../../../src/infrastructure/musicDb/musicDbRepositories.js';
import { cleanupMusicDbFixtures, createMusicDbFixture } from '../../helpers/musicDbFixture.js';

const ARTIST_ID = 'b3ae82c2-3f9e-4d3d-9f0f-0e4b2a3e0a01';
const GROUP_ID = 'e6db15f5-6c21-7a60-c232-3b7e5d6b3d04';
const GROUP_TWO_ID = 'c0bf59d9-a065-b1a4-0676-7fb291af7b08';

const seed = {
    artists: [{ mbid: ARTIST_ID, name: 'Lloyd Banks', ended: 0 }],
    releaseGroups: [
        {
            mbid: GROUP_ID,
            title: 'Hunger for More',
            primary_type: 'Album',
            disambiguation: '',
            first_release_date: '2003-04-29',
        },
        {
            mbid: GROUP_TWO_ID,
            title: 'The Course of the Inevitable',
            primary_type: 'Album',
            disambiguation: '',
            first_release_date: '2021-06-04',
        },
    ],
    releaseGroupArtists: [
        {
            release_group_mbid: GROUP_ID,
            artist_mbid: ARTIST_ID,
            artist_name: 'Lloyd Banks',
            join_phrase: '',
            position: 0,
        },
    ],
    releases: [
        {
            mbid: 'f7ec26a6-7d32-8b71-d343-4c8f6e7c4e05',
            title: 'Hunger for More',
            date: '2003-04-29',
            disambiguation: '',
            release_group_mbid: GROUP_ID,
            status: 'Official',
            country: 'US',
        },
        {
            mbid: 'a8fd37b7-8e43-9c82-e454-5d907f8d5f06',
            title: 'Hunger for More (Deluxe Edition)',
            date: '2003-06-17',
            disambiguation: 'digital',
            release_group_mbid: GROUP_ID,
            status: 'Official',
            country: 'GB',
        },
        {
            mbid: 'b9ae48c8-9f54-a093-f565-6ea1809e6a07',
            title: 'The Course of the Inevitable',
            date: '2021-06-04',
            disambiguation: '',
            release_group_mbid: GROUP_TWO_ID,
            status: 'Bootleg',
            country: 'US',
        },
    ],
    media: [
        {
            release_mbid: 'f7ec26a6-7d32-8b71-d343-4c8f6e7c4e05',
            position: 1,
            format: 'CD',
            track_count: 12,
            title: '',
        },
        {
            release_mbid: 'a8fd37b7-8e43-9c82-e454-5d907f8d5f06',
            position: 1,
            format: 'Digital Media',
            track_count: 18,
            title: '',
        },
        {
            release_mbid: 'b9ae48c8-9f54-a093-f565-6ea1809e6a07',
            position: 1,
            format: 'CD',
            track_count: 30,
            title: '',
        },
    ],
    meta: { track_data_state: 'ready' },
    releaseArtists: [
        {
            release_mbid: 'f7ec26a6-7d32-8b71-d343-4c8f6e7c4e05',
            artist_mbid: ARTIST_ID,
            artist_name: 'Lloyd Banks',
            join_phrase: '',
            position: 0,
        },
        {
            release_mbid: 'a8fd37b7-8e43-9c82-e454-5d907f8d5f06',
            artist_mbid: ARTIST_ID,
            artist_name: 'Lloyd Banks',
            join_phrase: '',
            position: 0,
        },
        {
            release_mbid: 'b9ae48c8-9f54-a093-f565-6ea1809e6a07',
            artist_mbid: ARTIST_ID,
            artist_name: 'Lloyd Banks',
            join_phrase: '',
            position: 0,
        },
    ],
};

describe('getArtistReleaseGroupCatalog', () => {
    beforeEach(() => {
        closeMusicDb();
        process.env.MUSIC_DB_PATH = createMusicDbFixture(seed);
    });

    afterEach(() => {
        closeMusicDb();
        cleanupMusicDbFixtures();
        delete process.env.MUSIC_DB_PATH;
    });

    it('returns every release of a group, not one per group', async () => {
        const catalog = await getArtistReleaseGroupCatalog(ARTIST_ID);
        const hunger = catalog.groups.find((group) => group.id === GROUP_ID);

        assert.ok(hunger);
        assert.equal(hunger.releaseIds.length, 2);
        assert.equal(hunger.title, 'Hunger for More');
        assert.equal(hunger.date, '2003-04-29');
        assert.equal(hunger.primaryType, 'Album');
    });

    it('picks the newest pressing as the representative release', async () => {
        const catalog = await getArtistReleaseGroupCatalog(ARTIST_ID);
        const hunger = catalog.groups.find((group) => group.id === GROUP_ID);

        assert.ok(hunger);
        // 2003-06-17 is the newer of the two pressings.
        assert.equal(hunger.newestReleaseId, 'a8fd37b7-8e43-9c82-e454-5d907f8d5f06');
    });

    it('snapshots Official editions with media and keyword metadata', async () => {
        const catalog = await getArtistReleaseGroupCatalog(ARTIST_ID);
        const hunger = catalog.groups.find((group) => group.id === GROUP_ID);

        assert.ok(hunger);
        assert.deepEqual(
            hunger.officialEditions.map((edition) => ({
                releaseId: edition.releaseId,
                status: edition.status,
                trackCount: edition.trackCount,
                formats: edition.formats,
                editionKeywords: edition.editionKeywords,
            })),
            [
                {
                    releaseId: 'f7ec26a6-7d32-8b71-d343-4c8f6e7c4e05',
                    status: 'Official',
                    trackCount: 12,
                    formats: ['CD'],
                    editionKeywords: [],
                },
                {
                    releaseId: 'a8fd37b7-8e43-9c82-e454-5d907f8d5f06',
                    status: 'Official',
                    trackCount: 18,
                    formats: ['Digital Media'],
                    editionKeywords: ['deluxe'],
                },
            ],
        );
    });

    it('never puts a non-Official release in the edition baseline', async () => {
        const catalog = await getArtistReleaseGroupCatalog(ARTIST_ID);
        const bootleg = catalog.groups.find((group) => group.id === GROUP_TWO_ID);

        assert.ok(bootleg);
        assert.deepEqual(bootleg.officialEditions, []);
    });

    it('orders groups newest first, like the artist screen', async () => {
        const catalog = await getArtistReleaseGroupCatalog(ARTIST_ID);

        assert.deepEqual(
            catalog.groups.map((group) => group.id),
            [GROUP_TWO_ID, GROUP_ID],
        );
    });

    it('marks a capped notification catalogue incomplete instead of silently truncating', async () => {
        process.env.MUSIC_DB_MAX_ARTIST_NOTIFICATION_RELEASES = '1';
        try {
            const catalog = await getArtistReleaseGroupCatalog(ARTIST_ID);
            assert.equal(catalog.complete, false);
            assert.deepEqual(catalog.groups, []);
        } finally {
            delete process.env.MUSIC_DB_MAX_ARTIST_NOTIFICATION_RELEASES;
        }
    });

    it('stops the safety probe at the bound instead of counting the whole catalogue', () => {
        const db = getMusicDb();
        assert.ok(db);

        assert.equal(countArtistNotificationReleasesUpTo(db, ARTIST_ID, 1), 2);
        assert.equal(countArtistNotificationReleasesUpTo(db, ARTIST_ID, 100), 3);
    });

    it('counts distinct releases for the bounded probe, not repeated credits', async () => {
        closeMusicDb();
        const duplicatePath = createMusicDbFixture({
            ...seed,
            releaseArtists: [
                ...seed.releaseArtists,
                {
                    release_mbid: 'f7ec26a6-7d32-8b71-d343-4c8f6e7c4e05',
                    artist_mbid: ARTIST_ID,
                    artist_name: 'Lloyd Banks',
                    join_phrase: '',
                    position: 1,
                },
            ],
        });
        process.env.MUSIC_DB_PATH = duplicatePath;
        process.env.MUSIC_DB_MAX_ARTIST_NOTIFICATION_RELEASES = '3';
        try {
            const catalog = await getArtistReleaseGroupCatalog(ARTIST_ID);
            const hunger = catalog.groups.find((group) => group.id === GROUP_ID);
            const firstEdition = hunger?.officialEditions.find(
                (edition) => edition.releaseId === 'f7ec26a6-7d32-8b71-d343-4c8f6e7c4e05',
            );

            assert.equal(catalog.complete, true);
            assert.equal(firstEdition?.trackCount, 12);
        } finally {
            delete process.env.MUSIC_DB_MAX_ARTIST_NOTIFICATION_RELEASES;
        }
    });

    it('marks the catalogue incomplete when distinct releases exceed the limit', async () => {
        process.env.MUSIC_DB_MAX_ARTIST_NOTIFICATION_RELEASES = '2';
        try {
            const catalog = await getArtistReleaseGroupCatalog(ARTIST_ID);
            assert.equal(catalog.complete, false);
        } finally {
            delete process.env.MUSIC_DB_MAX_ARTIST_NOTIFICATION_RELEASES;
        }
    });

    it('returns incomplete when a concurrent writer grows the catalogue after the probe', () => {
        const path = process.env.MUSIC_DB_PATH;
        assert.ok(path);
        const writer = new Database(path);
        try {
            writer.pragma('journal_mode = WAL');
            const db = getMusicDb();
            assert.ok(db);
            const limit = 3;
            assert.equal(countArtistNotificationReleasesUpTo(db, ARTIST_ID, limit), 3);

            const insert = writer
                .prepare(
                    `INSERT INTO releases (mbid, title, date, release_group_mbid, status, country)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                )
                .run(
                    'cccccccc-cccc-cccc-cccc-cccccccccccc',
                    'Concurrent release',
                    '2026-01-01',
                    GROUP_ID,
                    'Official',
                    'US',
                );
            writer
                .prepare(
                    `INSERT INTO release_artists (release_id, artist_id, artist_name, join_phrase, position)
                     VALUES (?, (SELECT id FROM artists WHERE mbid = ?), ?, '', 0)`,
                )
                .run(insert.lastInsertRowid, ARTIST_ID, 'Lloyd Banks');

            const rows = readArtistNotificationCatalogRows(db, ARTIST_ID, limit);
            const catalog = buildArtistNotificationCatalogFromRows(rows, limit);

            assert.equal(catalog.complete, false);
            assert.deepEqual(catalog.groups, []);
        } finally {
            writer.close();
        }
    });

    it('lets the loader expose overflow added after the probe passed', () => {
        const db = getMusicDb();
        assert.ok(db);

        const rows = readArtistNotificationCatalogRows(db, ARTIST_ID, 2);

        assert.ok(rows.length > 0);
        assert.equal(rows[0]?.artist_release_count, 3);
    });

    it('does not let the browse cap truncate notification detection', async () => {
        process.env.MUSIC_DB_MAX_ARTIST_RELEASE_GROUPS = '1';
        try {
            const catalog = await getArtistReleaseGroupCatalog(ARTIST_ID);
            assert.equal(catalog.complete, true);
            assert.equal(catalog.groups.length, 2);
        } finally {
            delete process.env.MUSIC_DB_MAX_ARTIST_RELEASE_GROUPS;
        }
    });

    it('fails explicitly when mirror edition data is not ready', async () => {
        closeMusicDb();
        const path = createMusicDbFixture({ ...seed, meta: { track_data_state: 'building' } });
        process.env.MUSIC_DB_PATH = path;

        await assert.rejects(
            () => getArtistReleaseGroupCatalog(ARTIST_ID),
            /track\/edition data is not ready/,
        );
    });

    it('reports an unknown artist as an incomplete catalogue without remote fallback', async () => {
        const catalog = await getArtistReleaseGroupCatalog('unknown-artist');

        assert.equal(catalog.complete, false);
        assert.deepEqual(catalog.groups, []);
    });

    it('uses an artist-first query plan for the notification catalogue', () => {
        const db = getMusicDb();
        assert.ok(db);
        let sql = '';
        const originalPrepare = db.prepare.bind(db);
        db.prepare = ((statement: string) => {
            if (statement.includes('artist_release_ids')) {
                sql = statement;
            }
            return originalPrepare(statement);
        }) as typeof db.prepare;

        try {
            readArtistNotificationCatalogRows(db, ARTIST_ID, 100);
        } finally {
            db.prepare = originalPrepare;
        }

        assert.ok(sql.length > 0);
        const plan = originalPrepare(`EXPLAIN QUERY PLAN ${sql}`).all(ARTIST_ID, 100) as Array<{
            detail: string;
        }>;
        const details = plan.map((row) => row.detail).join('\n');

        assert.match(details, /idx_release_artists_artist_rel/);
        assert.doesNotMatch(details, /SCAN rg/);
    });

    it('deduplicates repeated artist credits for one release', () => {
        closeMusicDb();
        const duplicatePath = createMusicDbFixture({
            ...seed,
            releaseArtists: [
                ...seed.releaseArtists,
                {
                    release_mbid: 'f7ec26a6-7d32-8b71-d343-4c8f6e7c4e05',
                    artist_mbid: 'b3ae82c2-3f9e-4d3d-9f0f-0e4b2a3e0a01',
                    artist_name: 'Lloyd Banks',
                    join_phrase: '',
                    position: 1,
                },
            ],
        });
        process.env.MUSIC_DB_PATH = duplicatePath;

        return getArtistReleaseGroupCatalog(ARTIST_ID).then((catalog) => {
            const hunger = catalog.groups.find((group) => group.id === GROUP_ID);
            assert.ok(hunger);
            assert.equal(hunger.releaseIds.length, 2);
        });
    });

    it('aggregates many media rows for one release', async () => {
        closeMusicDb();
        const multiMediaPath = createMusicDbFixture({
            ...seed,
            media: [
                ...seed.media,
                {
                    release_mbid: 'f7ec26a6-7d32-8b71-d343-4c8f6e7c4e05',
                    position: 2,
                    format: 'DVD',
                    track_count: 2,
                    title: '',
                },
            ],
        });
        process.env.MUSIC_DB_PATH = multiMediaPath;

        const catalog = await getArtistReleaseGroupCatalog(ARTIST_ID);
        const hunger = catalog.groups.find((group) => group.id === GROUP_ID);
        const edition = hunger?.officialEditions.find(
            (entry) => entry.releaseId === 'f7ec26a6-7d32-8b71-d343-4c8f6e7c4e05',
        );

        assert.equal(edition?.trackCount, 14);
        assert.deepEqual(edition?.formats, ['CD', 'DVD']);
    });

    it('keeps a complete catalogue with missing media usable with unknown counts', async () => {
        closeMusicDb();
        const noMediaPath = createMusicDbFixture({ ...seed, media: [] });
        process.env.MUSIC_DB_PATH = noMediaPath;

        const catalog = await getArtistReleaseGroupCatalog(ARTIST_ID);
        const hunger = catalog.groups.find((group) => group.id === GROUP_ID);

        assert.equal(catalog.complete, true);
        assert.ok(hunger);
        assert.deepEqual(
            hunger.officialEditions.map((edition) => edition.trackCount),
            [null, null],
        );
    });

    it('marks a catalogue incomplete when a release group parent row is missing', () => {
        closeMusicDb();
        const missingParent = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
        const path = createMusicDbFixture({
            ...seed,
            releases: [
                ...seed.releases,
                {
                    mbid: 'deadbeef-dead-dead-dead-deaddeadbeef',
                    title: 'Missing parent',
                    date: '2020-01-01',
                    disambiguation: '',
                    release_group_mbid: missingParent,
                    status: 'Official',
                    country: 'US',
                },
            ],
            releaseArtists: [
                ...seed.releaseArtists,
                {
                    release_mbid: 'deadbeef-dead-dead-dead-deaddeadbeef',
                    artist_mbid: ARTIST_ID,
                    artist_name: 'Lloyd Banks',
                    join_phrase: '',
                    position: 0,
                },
            ],
        });
        process.env.MUSIC_DB_PATH = path;

        return getArtistReleaseGroupCatalog(ARTIST_ID).then((catalog) => {
            assert.equal(catalog.complete, false);
        });
    });

    it('loads the notification catalogue without the browse aggregate query', async () => {
        const db = getMusicDb();
        assert.ok(db);
        const statements: string[] = [];
        const originalPrepare = db.prepare.bind(db);
        db.prepare = ((sql: string) => {
            statements.push(sql);
            return originalPrepare(sql);
        }) as typeof db.prepare;

        try {
            await getArtistReleaseGroupCatalog(ARTIST_ID);
        } finally {
            db.prepare = originalPrepare;
        }

        assert.equal(statements.filter((sql) => sql.includes('LEFT JOIN media')).length, 1);
        assert.equal(statements.filter((sql) => sql.includes('group_concat(r.mbid')).length, 0);
    });

    it('omits credits rather than inventing them, so callers can fetch per group', async () => {
        const catalog = await getArtistReleaseGroupCatalog(ARTIST_ID);

        // The mirror path fills credits on demand for new groups only.
        assert.equal(catalog.creditsByGroupId.size, 0);
    });
});
