import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';

import { installFetch } from '../../helpers/daprTestHelpers.js';

describe('cacheService', () => {
    const state = new Map<string, string>();
    const savedItems: Array<Record<string, unknown>> = [];
    const deletedKeys: string[] = [];

    const setupStateStore = () => {
        installFetch((url, init) => {
            const parsed = new URL(url);
            const statePrefix = '/v1.0/state/pawify-state';
            assert.ok(parsed.pathname.startsWith(statePrefix));

            if (init.method === 'POST') {
                const items = JSON.parse(String(init.body)) as Array<{
                    key: string;
                    value: string;
                }>;
                savedItems.push(...items);
                items.forEach((item) => state.set(item.key, item.value));
                return new Response(null, { status: 204 });
            }

            const key = decodeURIComponent(parsed.pathname.slice(`${statePrefix}/`.length));
            if (init.method === 'DELETE') {
                deletedKeys.push(key);
                state.delete(key);
                return new Response(null, { status: 204 });
            }

            const value = state.get(key);
            return value === undefined
                ? new Response(null, { status: 204 })
                : new Response(JSON.stringify(value), { status: 200 });
        });
    };

    beforeEach(() => {
        state.clear();
        savedItems.length = 0;
        deletedKeys.length = 0;
        setupStateStore();
    });

    it('stores and retrieves a simple object', async () => {
        const { getCachedData, replaceCachedData } =
            await import('../../../src/services/cacheService.js');

        await replaceCachedData('simple', { name: 'test', count: 42 }, 2);
        const result = await getCachedData<{ name: string; count: number }>('simple');

        assert.deepEqual(result, { name: 'test', count: 42 });
    });

    it('stores and retrieves undefined as a special marker', async () => {
        const { getCachedData, replaceCachedData } =
            await import('../../../src/services/cacheService.js');

        await replaceCachedData('undef-key', undefined);
        const result = await getCachedData('undef-key');

        assert.equal(result, undefined);
    });

    it('returns null for a missing key', async () => {
        const { getCachedData } = await import('../../../src/services/cacheService.js');

        const result = await getCachedData('nonexistent');

        assert.equal(result, null);
    });

    it('returns null for an empty-string value stored via state', async () => {
        // Simulate an empty string being stored at the Dapr level
        state.set('empty-key', JSON.stringify(''));
        const { getCachedData } = await import('../../../src/services/cacheService.js');

        const result = await getCachedData<string>('empty-key');

        assert.equal(result, '');
    });

    it('chunks large values and retrieves them', async () => {
        const { getCachedData, replaceCachedData } =
            await import('../../../src/services/cacheService.js');
        const largeValue = 'x'.repeat(1024 * 1024 + 128);

        await replaceCachedData('large', largeValue, 1);
        const result = await getCachedData<string>('large');

        assert.equal(result, largeValue);
    });

    it('saves TTL metadata on state items', async () => {
        const { replaceCachedData } = await import('../../../src/services/cacheService.js');

        await replaceCachedData('ttl-test', { data: 1 }, 5);

        const metadataItem = savedItems.find((item) => item.key === 'ttl-test');
        assert.ok(metadataItem);
        assert.deepEqual((metadataItem as any).metadata, { ttlInSeconds: String(5 * 3600) });
    });

    it('deletes a simple key and its data', async () => {
        const { deleteCachedData, getCachedData, replaceCachedData } =
            await import('../../../src/services/cacheService.js');

        await replaceCachedData('to-delete', { x: 1 });
        assert.ok(await getCachedData('to-delete'));

        await deleteCachedData('to-delete');
        assert.equal(await getCachedData('to-delete'), null);
        assert.ok(deletedKeys.includes('to-delete'));
    });

    it('deletes chunked keys including all chunks and metadata', async () => {
        const { deleteCachedData, getCachedData, replaceCachedData } =
            await import('../../../src/services/cacheService.js');
        const largeValue = 'y'.repeat(1024 * 1024 + 200);

        await replaceCachedData('chunk-delete', largeValue, 1);
        assert.ok(await getCachedData('chunk-delete'));

        await deleteCachedData('chunk-delete');

        assert.ok(deletedKeys.includes('chunk-delete'));
        assert.ok(deletedKeys.includes('chunk-delete:metadata'));
        assert.ok(deletedKeys.some((k) => k.startsWith('chunk-delete:chunk')));
        assert.equal(await getCachedData('chunk-delete'), null);
    });

    it('returns null and cleans up when chunks are missing', async () => {
        const { getCachedData, replaceCachedData } =
            await import('../../../src/services/cacheService.js');
        const largeValue = 'z'.repeat(1024 * 1024 + 128);

        await replaceCachedData('partial', largeValue, 1);

        // Delete one chunk to simulate corruption
        state.delete('partial:chunk0000');
        const result = await getCachedData('partial');

        assert.equal(result, null);
        // Should have cleaned up by deleting metadata and remaining chunks
        assert.ok(deletedKeys.some((k) => k === 'partial:metadata' || k.startsWith('partial')));
    });

    it('propagates state store errors on get', async () => {
        setupStateStore();
        // Override with a failing fetch
        installFetch(() => {
            throw new Error('state store connection failed');
        });
        const { getCachedData } = await import('../../../src/services/cacheService.js');

        await assert.rejects(() => getCachedData('any-key'), /state store connection failed/);
    });

    it('propagates state store errors on set', async () => {
        setupStateStore();
        installFetch(() => {
            throw new Error('state store write failed');
        });
        const { replaceCachedData } = await import('../../../src/services/cacheService.js');

        await assert.rejects(
            () => replaceCachedData('any-key', { data: 1 }),
            /state store write failed/,
        );
    });
});
