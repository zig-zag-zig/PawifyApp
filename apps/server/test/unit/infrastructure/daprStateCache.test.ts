import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';

import { installFetch } from '../../helpers/daprTestHelpers.js';

describe('Dapr state cache migration', () => {
    const state = new Map<string, string>();
    const savedItems: Array<Record<string, unknown>> = [];
    const deletedKeys: string[] = [];

    beforeEach(() => {
        state.clear();
        savedItems.length = 0;
        deletedKeys.length = 0;
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
    });

    it('round trips simple and undefined cache values with TTL metadata', async () => {
        const { getCachedData, replaceCachedData } =
            await import('../../../src/services/cacheService.js');

        await replaceCachedData('simple', { name: 'test' }, 2);
        assert.deepEqual(await getCachedData('simple'), { name: 'test' });
        assert.deepEqual(savedItems.at(-1)?.metadata, { ttlInSeconds: '7200' });

        await replaceCachedData('undefined-value', undefined);
        assert.equal(await getCachedData('undefined-value'), undefined);
    });

    it('chunks large values and deletes partial chunked entries', async () => {
        const { deleteCachedData, getCachedData, replaceCachedData } =
            await import('../../../src/services/cacheService.js');
        const largeValue = 'x'.repeat(1024 * 1024 + 128);

        await replaceCachedData('large', largeValue, 1);

        const metadata = state.get('large:metadata');
        assert.ok(metadata);
        const totalChunks = Number(JSON.parse(metadata).totalChunks);
        assert.ok(totalChunks > 1);
        assert.equal(await getCachedData('large'), largeValue);

        state.delete('large:chunk0000');
        assert.equal(await getCachedData('large'), null);
        assert.ok(deletedKeys.includes('large:metadata'));

        await replaceCachedData('large-delete', largeValue, 1);
        await deleteCachedData('large-delete');
        assert.ok(deletedKeys.includes('large-delete'));
        assert.ok(deletedKeys.includes('large-delete:metadata'));
        assert.ok(deletedKeys.includes('large-delete:chunk0000'));
    });
});
