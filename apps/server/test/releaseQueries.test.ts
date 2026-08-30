import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { installFetch } from './helpers/daprTestHelpers.js';
import {
    fetchAllReleasesForArtist,
    fetchAllReleasesForReleaseGroup,
} from '../src/services/musicbrainz/releaseQueries.js';

// Pagination guards under test: with release-count missing or non-finite, a page
// shorter than the limit (or an empty page) terminates the loop; with a declared
// count, the loop stops once the accumulated offset reaches it.

const FULL_PAGE_SIZE = 100;

const createRawRelease = (id: string, date: string) => ({
    id,
    title: `Release ${id}`,
    date,
});

const pageOf = (ids: string[], date: string): Array<Record<string, unknown>> =>
    ids.map((id) => createRawRelease(id, date));

const fullPageIds = (prefix: string): string[] =>
    Array.from({ length: FULL_PAGE_SIZE }, (_, index) => `${prefix}${index}`);

const installPageFetch = (pages: Array<Record<string, unknown>>): { callCount: () => number } => {
    const queue = [...pages];
    let calls = 0;
    installFetch(() => {
        calls += 1;
        const page = queue.shift();
        if (!page) {
            throw new Error(`unexpected extra fetch call #${calls}`);
        }
        return new Response(JSON.stringify(page), { status: 200 });
    });
    return { callCount: () => calls };
};

describe('fetchAllReleasesForArtist pagination guards', () => {
    const table = [
        {
            name: 'paginates to the declared release-count',
            pages: [
                { releases: pageOf(['r1', 'r2'], '2020-01-01'), 'release-count': 3 },
                { releases: pageOf(['r3'], '2020-01-02'), 'release-count': 3 },
            ],
            expectedIds: ['r1', 'r2', 'r3'],
        },
        {
            name: 'stops after the first page when release-count is missing and it is short',
            pages: [{ releases: pageOf(['r1', 'r2'], '2020-01-01') }],
            expectedIds: ['r1', 'r2'],
        },
        {
            name: 'continues past full pages and stops on the short page when release-count is missing',
            pages: [
                { releases: pageOf(fullPageIds('r'), '2020-01-01') },
                { releases: pageOf(['r100'], '2020-01-02') },
            ],
            expectedIds: [...fullPageIds('r'), 'r100'],
        },
        {
            name: 'stops on an empty page when release-count is missing',
            pages: [
                { releases: pageOf(fullPageIds('r'), '2020-01-01') },
                { releases: [], 'release-count': undefined },
            ],
            expectedIds: fullPageIds('r'),
        },
        {
            name: 'stops on a non-finite release-count',
            pages: [{ releases: pageOf(['r1', 'r2'], '2020-01-01'), 'release-count': 'oops' }],
            expectedIds: ['r1', 'r2'],
        },
    ];

    for (const row of table) {
        it(row.name, async () => {
            const { callCount } = installPageFetch(row.pages);

            const releases = await fetchAllReleasesForArtist('artist-1', false);

            assert.deepEqual(
                releases.map((release) => release.id),
                row.expectedIds,
            );
            assert.equal(callCount(), row.pages.length);
        });
    }

    it('reports isLastPage to the page handler, including when release-count is missing', async () => {
        const { callCount } = installPageFetch([
            { releases: pageOf(fullPageIds('r'), '2020-01-01') },
            { releases: pageOf(['r100'], '2020-01-02') },
        ]);
        const lastPageFlags: boolean[] = [];

        await fetchAllReleasesForArtist('artist-1', false, async (_page, isLastPage) => {
            lastPageFlags.push(isLastPage);
        });

        assert.deepEqual(lastPageFlags, [false, true]);
        assert.equal(callCount(), 2);
    });
});

describe('fetchAllReleasesForReleaseGroup pagination guards', () => {
    const table = [
        {
            name: 'paginates to the declared release-count',
            pages: [
                {
                    releases: [
                        createRawRelease('r1', '2020-01-01'),
                        createRawRelease('r2', '2020-01-02'),
                    ],
                    'release-count': 3,
                },
                { releases: [createRawRelease('r3', '2020-01-03')], 'release-count': 3 },
            ],
            // sortReleasesByDate orders newest first.
            expectedIds: ['r3', 'r2', 'r1'],
        },
        {
            name: 'stops after the first page when release-count is missing and it is short',
            pages: [
                {
                    releases: [
                        createRawRelease('r1', '2020-01-01'),
                        createRawRelease('r2', '2020-01-02'),
                    ],
                },
            ],
            expectedIds: ['r2', 'r1'],
        },
        {
            name: 'continues past full pages and stops on the short page when release-count is missing',
            pages: [
                { releases: pageOf(fullPageIds('r'), '2020-01-01') },
                { releases: [createRawRelease('r100', '2020-01-02')] },
            ],
            // Equal dates keep insertion order, so only r100 moves ahead.
            expectedIds: ['r100', ...fullPageIds('r')],
        },
        {
            name: 'stops on an empty page when release-count is missing',
            pages: [
                { releases: pageOf(fullPageIds('r'), '2020-01-01') },
                { releases: [], 'release-count': undefined },
            ],
            expectedIds: fullPageIds('r'),
        },
        {
            name: 'stops on a non-finite release-count',
            pages: [
                {
                    releases: [
                        createRawRelease('r1', '2020-01-01'),
                        createRawRelease('r2', '2020-01-02'),
                    ],
                    'release-count': 'oops',
                },
            ],
            expectedIds: ['r2', 'r1'],
        },
    ];

    for (const row of table) {
        it(row.name, async () => {
            const { callCount } = installPageFetch(row.pages);

            const releases = await fetchAllReleasesForReleaseGroup('release-group-1');

            assert.deepEqual(
                releases.map((release) => release.id),
                row.expectedIds,
            );
            assert.equal(callCount(), row.pages.length);
        });
    }
});
