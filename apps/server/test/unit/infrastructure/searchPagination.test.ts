import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { describe, it } from 'node:test';

import { createMusicDbFixture } from '../../helpers/musicDbFixture.js';
import {
    RANKED_CANDIDATE_WINDOW,
    rankSearchEntities,
    searchEntitiesWithBudget,
} from '../../../src/infrastructure/musicDb/musicDbQueries.js';

const artistSeed = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
        entityType: 'artist' as const,
        entityId: `artist-${String(index).padStart(4, '0')}`,
        heading: `Song Writer ${index}`,
        sortName: `Song Writer ${index}`,
        refCount: 1000 - index,
    }));

const openFixture = (count: number) => {
    const path = createMusicDbFixture({ search: artistSeed(count) });
    return new Database(path, { readonly: true });
};

describe('search pagination', () => {
    it('pages the ranked candidate set without repeating or skipping rows', () => {
        // More matches than the recall window, so paging has to continue past it.
        const db = openFixture(900);
        const seen = new Set<string>();
        let offset = 0;
        let countedRows = 0;
        let reportedCount = 0;

        while (offset < 2000) {
            const page = searchEntitiesWithBudget(
                db as never,
                'artist',
                '"song"*',
                100,
                offset,
                '',
                'song',
            );
            reportedCount = page.count;

            if (page.rows.length === 0) {
                break;
            }

            for (const row of page.rows) {
                assert.equal(
                    seen.has(row.mbid),
                    false,
                    `row ${row.mbid} repeated on page at offset ${offset}`,
                );
                seen.add(row.mbid);
            }

            countedRows += page.rows.length;
            offset += 100;
        }

        assert.equal(seen.size, countedRows);
        // The reported count is exactly what paging can reach, so a client that
        // stops at `count` rows never asks for a page that would be empty.
        assert.equal(reportedCount, countedRows);
        assert.ok(countedRows >= RANKED_CANDIDATE_WINDOW);
    });

    it('reports a count that paging can actually reach', () => {
        const db = openFixture(900);
        const first = searchEntitiesWithBudget(
            db as never,
            'artist',
            '"song"*',
            100,
            0,
            '',
            'song',
        );

        assert.equal(first.capped, false);
        assert.equal(
            first.count,
            rankSearchEntities(db as never, 'artist', '"song"*', '', 'song').available,
        );
        // Recall is bounded by design; the count must not claim rows past that bound.
        assert.ok(first.count <= 900);
    });

    it('returns an empty page past the end instead of repeating earlier rows', () => {
        const db = openFixture(40);
        const past = searchEntitiesWithBudget(
            db as never,
            'artist',
            '"song"*',
            100,
            500,
            '',
            'song',
        );

        assert.deepEqual(past.rows, []);
    });
});
