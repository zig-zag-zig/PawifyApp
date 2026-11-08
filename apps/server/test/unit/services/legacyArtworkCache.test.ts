import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { closeMusicDb } from '../../../src/infrastructure/musicDb/musicDbClient.js';
import { resetEntityImageRepositoryForTests } from '../../../src/infrastructure/musicDb/entityImageRepository.js';
import { createMusicDbFixture } from '../../helpers/musicDbFixture.js';

process.env.DAPR_HTTP_ENDPOINT = 'http://dapr.test:3500';

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

const installStateStub = (): { writes: string[]; deletes: string[] } => {
    const writes: string[] = [];
    const deletes: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url.includes('/v1.0/state/')) {
            if (method === 'POST' || method === 'PUT') {
                writes.push(url);
                return new Response(null, { status: 204 });
            }
            if (method === 'DELETE') {
                deletes.push(url);
                return new Response(null, { status: 204 });
            }
            return new Response(null, { status: 404 });
        }
        return new Response(null, { status: 404 });
    }) as typeof fetch;
    return { writes, deletes };
};

beforeEach(() => {
    const path = createMusicDbFixture({});
    process.env.MUSIC_DB_PATH = path;
    closeMusicDb();
    resetEntityImageRepositoryForTests();
});

afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
    closeMusicDb();
    resetEntityImageRepositoryForTests();
});

describe('legacy artwork cache keys', () => {
    it('never writes a mirror-backed artwork key once the mirror has the tables', async () => {
        const { writes } = installStateStub();
        const { assetKeys, writeAssetState } =
            await import('../../../src/services/cache/assetCache.js');

        await writeAssetState(assetKeys.releaseCover('release-1'), {
            url: 'https://cdn-images.dzcdn.net/images/cover/x/1000x1000.jpg',
        });

        assert.deepEqual(writes, [], 'artwork must not be duplicated into Redis');
    });

    it('deletes a leftover artwork key instead of serving it', async () => {
        const { deletes } = installStateStub();
        const { assetKeys, readAssetState } =
            await import('../../../src/services/cache/assetCache.js');

        const state = await readAssetState(assetKeys.groupCover('group-1'));

        assert.equal(state, null);
        assert.ok(
            deletes.some(
                (url) =>
                    url.includes('asset%3Agroup-cover%3Agroup-1') ||
                    url.includes('asset:group-cover:group-1'),
            ),
            `expected the legacy key to be deleted, got ${JSON.stringify(deletes)}`,
        );
    });

    it('still caches lyrics, which the mirror does not store', async () => {
        const { writes } = installStateStub();
        const { assetKeys, writeAssetState } =
            await import('../../../src/services/cache/assetCache.js');

        await writeAssetState(assetKeys.trackLyrics('release-1', 'track-1'), {
            url: 'https://genius.com/song-lyrics',
        });

        assert.equal(writes.length > 0, true, 'lyrics must stay cached');
    });
});
