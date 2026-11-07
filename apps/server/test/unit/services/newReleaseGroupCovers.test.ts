import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, describe, it } from 'node:test';

import { createMusicDbFixture } from '../../helpers/musicDbFixture.js';
import { closeMusicDb, getMusicDb } from '../../../src/infrastructure/musicDb/musicDbClient.js';

const requireForTest = createRequire(__filename);

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

/** Provider calls are stubbed: these tests are about mapping, not about artwork. */
const stubMissingCoverArt = (): string[] => {
    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        calls.push(url);
        return new Response(null, { status: 404 });
    }) as typeof fetch;
    return calls;
};

afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
    closeMusicDb();
});

describe('fetchAndUpsertNewReleaseGroupCovers', () => {
    it('resolves one cover per group and maps it onto every release in that group', async () => {
        const path = createMusicDbFixture({
            releases: [
                { mbid: 'rel-1', release_group_mbid: 'group-1', title: 'One', date: '2026-01-01' },
                { mbid: 'rel-2', release_group_mbid: 'group-1', title: 'Two', date: '2026-02-01' },
            ],
        });

        process.env.MUSIC_DB_PATH = path;
        closeMusicDb();
        stubMissingCoverArt();

        const { fetchAndUpsertNewReleaseGroupCovers } =
            await import('../../../src/services/tasks/workers/coverTaskWorker.js');

        const result = await fetchAndUpsertNewReleaseGroupCovers(
            [{ releaseGroupId: 'group-1', releaseIds: ['rel-1', 'rel-2'] }],
            undefined,
        );
        const covers = result.covers;

        // Both release ids get an entry (a cover or an explicit miss), so the client
        // can clear its placeholders for the whole group in one response.
        assert.deepEqual(Object.keys(covers).sort(), ['rel-1', 'rel-2']);
        assert.equal(covers['rel-1'], covers['rel-2']);
        assert.ok(getMusicDb() !== null);
    });

    it('still resolves feed entries stored before release-group detection existed', async () => {
        // Those entries carry no `releaseGroupId`; they used to be skipped entirely,
        // which left a permanent placeholder in the New Releases feed.
        const path = createMusicDbFixture({
            releases: [
                {
                    mbid: 'legacy-rel',
                    release_group_mbid: 'legacy-group',
                    title: 'No Competition',
                    date: '2026-10-04',
                },
            ],
        });

        process.env.MUSIC_DB_PATH = path;
        closeMusicDb();
        stubMissingCoverArt();

        const { fetchAndUpsertNewReleaseGroupCovers } =
            await import('../../../src/services/tasks/workers/coverTaskWorker.js');

        const result = await fetchAndUpsertNewReleaseGroupCovers(
            [{ releaseGroupId: null, releaseIds: ['legacy-rel'] }],
            undefined,
        );

        assert.deepEqual(Object.keys(result.covers), ['legacy-rel']);
    });
});
describe('fetchAndUpsertNewReleaseGroupCovers provider url batching', () => {
    it('includes group-less feed releases in the single mirror provider-url lookup', async () => {
        // Standalone (pre-group) feed rows used to be resolved with one SQLite query
        // each. They belong to the same batch: one lookup for the whole page keeps a
        // 10-row page to one query instead of eleven.
        const path = createMusicDbFixture({
            releases: [
                { mbid: 'rel-1', release_group_mbid: 'group-1', title: 'One', date: '2026-01-01' },
                {
                    mbid: 'legacy-rel',
                    release_group_mbid: 'legacy-group',
                    title: 'Legacy',
                    date: '2026-01-02',
                },
            ],
        });

        process.env.MUSIC_DB_PATH = path;
        closeMusicDb();
        stubMissingCoverArt();

        const lookupModule = requireForTest('../../../src/services/coverArt/coverArtLookup.js') as {
            getReleaseProviderUrls: (releaseIds: readonly string[]) => unknown;
        };
        const original = lookupModule.getReleaseProviderUrls;
        const requested: string[][] = [];
        // This is the CJS exports object the worker already holds a reference to, so
        // replacing the property observes what the batch actually asks the mirror for.
        lookupModule.getReleaseProviderUrls = (releaseIds) => {
            requested.push([...releaseIds]);
            return original(releaseIds);
        };

        try {
            const { fetchAndUpsertNewReleaseGroupCovers } =
                await import('../../../src/services/tasks/workers/coverTaskWorker.js');

            await fetchAndUpsertNewReleaseGroupCovers(
                [
                    { releaseGroupId: 'group-1', releaseIds: ['rel-1'] },
                    { releaseGroupId: null, releaseIds: ['legacy-rel'] },
                ],
                undefined,
            );
        } finally {
            lookupModule.getReleaseProviderUrls = original;
        }

        assert.equal(requested.length, 1, 'one mirror lookup for the whole page');
        assert.deepEqual([...requested[0]!].sort(), ['legacy-rel', 'rel-1']);
    });
});
