import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { describe, it } from 'node:test';

import { createMusicDbFixture } from '../../helpers/musicDbFixture.js';
import {
    normalizeHeading,
    searchEntities,
    toFtsHeadingPhrase,
} from '../../../src/infrastructure/musicDb/musicDbQueries.js';

describe('search heading tier', () => {
    it('builds a heading phrase only for multi-token queries', () => {
        assert.equal(toFtsHeadingPhrase('jay z'), 'heading:"jay z"');
        assert.equal(toFtsHeadingPhrase('  jay   z  '), 'heading:"jay z"');
        assert.equal(toFtsHeadingPhrase('jay'), '');
        assert.equal(toFtsHeadingPhrase('!!!'), '');
        assert.equal(toFtsHeadingPhrase('say "hi"'), 'heading:"say hi"');
    });

    it('folds diacritics and punctuation when normalising a heading', () => {
        assert.equal(normalizeHeading('JAŸ-Z'), 'jayz');
        assert.equal(normalizeHeading('Jay Z'), 'jayz');
        assert.equal(normalizeHeading('H.F.M. 2'), 'hfm2');
    });

    it('ranks the name that is the query above other phrase matches', () => {
        const seed = [
            { entityId: 'a1', heading: 'Jay-Z & Ja Rule' },
            { entityId: 'a2', heading: 'Jay Z' },
            { entityId: 'a3', heading: 'JAŸ-Z' },
            { entityId: 'a4', heading: 'Jay Ziskrout' },
        ];
        const path = createMusicDbFixture({
            search: seed.map((row) => ({ ...row, entityType: 'artist' as const })),
        });
        const db = new Database(path, { readonly: true });

        const rows = searchEntities(
            db as never,
            'artist',
            '"jay"* OR "z"*',
            10,
            0,
            toFtsHeadingPhrase('jay z'),
            'jay z',
        );

        // Exact headings win; among inexact phrase matches, sort-name/ref-count
        // ordering is deliberately not asserted here because the complete MB-like
        // ordering is covered by the real-corpus audit rather than a 4-row fixture.
        assert.deepEqual(
            rows
                .map((row) => row.mbid)
                .slice(0, 2)
                .sort(),
            ['a2', 'a3'],
        );
        db.close();
    });

    it('keeps the recall query untouched on later pages', () => {
        const path = createMusicDbFixture({
            search: [
                { entityType: 'artist', entityId: 'a1', heading: 'Jay Z', refCount: 100 },
                { entityType: 'artist', entityId: 'a2', heading: 'Zane Jay', refCount: 100 },
            ],
        });
        const db = new Database(path, { readonly: true });

        const first = searchEntities(
            db as never,
            'artist',
            '"jay"* OR "z"*',
            1,
            0,
            toFtsHeadingPhrase('jay z'),
            'jay z',
        );
        const second = searchEntities(
            db as never,
            'artist',
            '"jay"* OR "z"*',
            1,
            1,
            toFtsHeadingPhrase('jay z'),
            'jay z',
        );

        assert.deepEqual(
            first.map((row) => row.mbid),
            ['a1'],
        );
        assert.equal(second.length, 1);
        assert.notEqual(second[0]?.mbid, first[0]?.mbid);
        db.close();
    });
});
