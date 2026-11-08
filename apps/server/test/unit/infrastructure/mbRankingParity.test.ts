import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { describe, it } from 'node:test';

import { createMusicDbFixture } from '../../helpers/musicDbFixture.js';
import { searchEntities } from '../../../src/infrastructure/musicDb/musicDbQueries.js';

type SearchRow = NonNullable<Parameters<typeof createMusicDbFixture>[0]>['search'];

const open = (search: SearchRow) =>
    new Database(createMusicDbFixture({ search }), { readonly: true });

describe('MusicBrainz-equivalent ranking', () => {
    it('ranks JAŸ-Z first for "jay", as the MusicBrainz search server does', () => {
        const db = open([
            // Long-tail artists that merely start with "jay" have low reference counts.
            { entityType: 'artist', entityId: 'a-jaybreezy', heading: 'Jaybreezy', refCount: 12 },
            { entityType: 'artist', entityId: 'a-jayjay', heading: 'Jay-Jay', refCount: 30 },
            { entityType: 'artist', entityId: 'a-ziskrout', heading: 'Jay Ziskrout', refCount: 40 },
            // The real one: sort name "Jay Z" and a reference count to match.
            {
                entityType: 'artist',
                entityId: 'a-jayz',
                heading: 'JAŸ-Z',
                sortName: 'Jay Z',
                refCount: 40000,
            },
        ]);

        const rows = searchEntities(db as never, 'artist', '"jay"*', 5, 0, '', 'jay');

        assert.equal(rows[0]?.mbid, 'a-jayz');
        db.close();
    });

    it('breaks a tie between equally good matches with the ref_count boost', () => {
        const db = open([
            { entityType: 'artist', entityId: 'a-small', heading: 'Jay Jay', refCount: 10 },
            { entityType: 'artist', entityId: 'a-big', heading: 'Jay Jay', refCount: 50000 },
        ]);

        const rows = searchEntities(db as never, 'artist', '"jay"*', 5, 0, '', 'jay');

        assert.equal(rows[0]?.mbid, 'a-big');
        db.close();
    });

    it('finds an artist by its sort name when the name itself does not match', () => {
        const db = open([
            // "Jay Z" as sort name is exactly how MusicBrainz finds JAŸ-Z.
            {
                entityType: 'artist',
                entityId: 'a-jayz',
                heading: 'JAŸ-Z',
                sortName: 'Jay Z',
                refCount: 40000,
            },
            { entityType: 'artist', entityId: 'a-other', heading: 'Someone Else', refCount: 10 },
        ]);

        const rows = searchEntities(db as never, 'artist', '"z"*', 5, 0, '', 'z');

        // sortname is indexed, so the artist is reachable through it.
        assert.ok(rows.some((row) => row.mbid === 'a-jayz'));
        db.close();
    });

    it('keeps pagination disjoint and limit-invariant across the ranked window', () => {
        const db = open(
            Array.from({ length: 25 }, (_, index) => ({
                entityType: 'artist',
                entityId: `a-${String(index).padStart(2, '0')}`,
                heading: index === 15 ? 'Radiohead' : `Radiohead Tribute ${index}`,
                refCount: index === 15 ? 50000 : 10 + index,
            })),
        );

        const all = searchEntities(db as never, 'artist', '"radiohead"*', 20, 0, '', 'radiohead');
        const page1 = searchEntities(db as never, 'artist', '"radiohead"*', 10, 0, '', 'radiohead');
        const page2 = searchEntities(
            db as never,
            'artist',
            '"radiohead"*',
            10,
            10,
            '',
            'radiohead',
        );

        assert.equal(page1[0]?.mbid, 'a-15');
        assert.deepEqual(
            [...page1, ...page2].map((row) => row.mbid),
            all.map((row) => row.mbid),
        );
        assert.equal(new Set([...page1, ...page2].map((row) => row.mbid)).size, 20);
        db.close();
    });

    it('treats & and "and" interchangeably like MBCharEquivToChar', () => {
        const db = open([
            {
                entityType: 'artist',
                entityId: 'a-band',
                heading: 'Simon & Garfunkel',
                refCount: 5000,
            },
            { entityType: 'artist', entityId: 'a-solo', heading: 'Paul Simon', refCount: 8000 },
        ]);

        const rows = searchEntities(
            db as never,
            'artist',
            '"simon"* OR "and"* OR "garfunkel"*',
            5,
            0,
            '',
            'simon and garfunkel',
        );

        assert.equal(rows[0]?.mbid, 'a-band');
        db.close();
    });

    it('expands artist aliases into release-group artist lookups at query time', () => {
        const db = open([
            {
                entityType: 'artist',
                entityId: 'a-jayz',
                heading: 'JAŸ-Z',
                sortName: 'Jay-Z',
                alias: 'Jay Z Shawn Carter',
                refCount: 20000,
            },
            {
                entityType: 'release_group',
                entityId: 'rg-blueprint',
                heading: 'The Blueprint',
                artistName: 'JAŸ-Z',
                refCount: 15,
            },
            {
                entityType: 'release_group',
                entityId: 'rg-noise',
                heading: 'Z-File',
                artistName: 'Someone Else',
                refCount: 1,
            },
        ]);

        const rows = searchEntities(
            db as never,
            'release_group',
            '"shawn"* OR "carter"*',
            5,
            0,
            '',
            'Shawn Carter',
        );

        assert.equal(rows[0]?.mbid, 'rg-blueprint');
        db.close();
    });

    it('degrades to API fallback when the mirror FTS table has an older schema', async () => {
        const path = createMusicDbFixture({
            artists: [{ mbid: 'a-1', name: 'Old Mirror', ended: 0 }],
            meta: { entities: 'artist,release-group,release', schema_sequence: '31' },
        });
        const writable = new Database(path);
        writable.exec('DROP TABLE search_fts_release_group');
        writable.exec(
            `CREATE VIRTUAL TABLE search_fts_release_group USING fts5(entity_mbid UNINDEXED, heading)`,
        );
        writable.close();

        const { closeMusicDb, musicDbHasSearchIndex } =
            await import('../../../src/infrastructure/musicDb/musicDbClient.js');
        closeMusicDb();
        process.env.MUSIC_DB_PATH = path;
        try {
            assert.equal(musicDbHasSearchIndex(), false);
        } finally {
            closeMusicDb();
            delete process.env.MUSIC_DB_PATH;
        }
    });
});
