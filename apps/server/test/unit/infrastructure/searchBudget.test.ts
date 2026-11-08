import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { describe, it } from 'node:test';

import { createMusicDbFixture } from '../../helpers/musicDbFixture.js';
import {
    SEARCH_MAX_MATCHES,
    searchEntitiesWithBudget,
    toFtsHeadingPhrase,
    toFtsQuery,
} from '../../../src/infrastructure/musicDb/musicDbQueries.js';

type SearchRow = NonNullable<Parameters<typeof createMusicDbFixture>[0]>['search'];

const open = (search: SearchRow) =>
    new Database(createMusicDbFixture({ search }), { readonly: true });

const search = (db: Database.Database, query: string) =>
    searchEntitiesWithBudget(
        db as never,
        'artist',
        toFtsQuery(query),
        5,
        0,
        toFtsHeadingPhrase(query),
        query,
    );

describe('search work budget', () => {
    it('still ranks the exact artist first when a stopword probe overflows the budget', () => {
        // "and"* matches every one of these rows, so the query is over budget and the
        // broad probes run unordered. The exact-phrase probe for the real artist is
        // narrow, so that one stays ordered and the match is still found and ranked
        // first — the stopword must not be allowed to swap in arbitrary rows.
        const filler: SearchRow = Array.from({ length: SEARCH_MAX_MATCHES + 50 }, (_, index) => ({
            entityType: 'artist',
            entityId: `a-and-${String(index).padStart(5, '0')}`,
            heading: `And Then ${index}`,
            refCount: 1,
        }));

        const db = open([
            ...filler,
            {
                entityType: 'artist',
                entityId: 'a-simon',
                heading: 'Simon & Garfunkel',
                sortName: 'Simon and Garfunkel',
                refCount: 5000,
            },
        ]);

        const result = search(db, 'simon and garfunkel');

        assert.equal(result.capped, true, 'the "and"* probe is over the budget');
        assert.equal(result.rows[0]?.mbid, 'a-simon');
        assert.ok(
            result.count <= SEARCH_MAX_MATCHES,
            `count must stay inside the budget, got ${result.count}`,
        );

        db.close();
    });

    it('keeps a query under the budget uncapped and ordered', () => {
        const db = open([
            {
                entityType: 'artist',
                entityId: 'a-simon',
                heading: 'Simon & Garfunkel',
                sortName: 'Simon and Garfunkel',
                refCount: 5000,
            },
            {
                entityType: 'artist',
                entityId: 'a-other',
                heading: 'Simon Says',
                refCount: 10,
            },
        ]);

        const result = search(db, 'simon garfunkel');

        assert.equal(result.capped, false);
        assert.equal(result.rows[0]?.mbid, 'a-simon');
        // "Simon Says" matches the shared token too, so both rows are pageable.
        assert.equal(result.count, 2);

        db.close();
    });
});
