import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { describe, it } from 'node:test';

import { mapWithConcurrency } from '../src/utils/helpers/promisePool.js';

describe('mapWithConcurrency', () => {
    it('limits concurrent work while preserving result order', async () => {
        let active = 0;
        let maxActive = 0;

        const results = await mapWithConcurrency([40, 10, 20, 5], 2, async (waitMs, index) => {
            active += 1;
            maxActive = Math.max(maxActive, active);
            await delay(waitMs);
            active -= 1;
            return `result-${index}`;
        });

        assert.equal(maxActive, 2);
        assert.deepEqual(results, ['result-0', 'result-1', 'result-2', 'result-3']);
    });

    it('returns an empty result without invoking the mapper', async () => {
        const results = await mapWithConcurrency([], 3, async () => {
            throw new Error('mapper should not run');
        });

        assert.deepEqual(results, []);
    });

    it('propagates mapper errors immediately', async () => {
        let callCount = 0;
        await assert.rejects(
            () =>
                mapWithConcurrency([10, 0, 20], 2, async (waitMs, index) => {
                    callCount += 1;
                    await delay(waitMs);
                    if (index === 1) {
                        throw new Error(`mapper failed at index ${index}`);
                    }
                    return `result-${index}`;
                }),
            /mapper failed at index 1/,
        );
        // Note: some concurrent tasks may still run before the rejection propagates
        assert.ok(callCount >= 2, 'at least 2 tasks should have started');
    });

    it('preserves result order even when tasks complete out of order', async () => {
        const results = await mapWithConcurrency([30, 10, 20], 3, async (waitMs, index) => {
            await delay(waitMs);
            return `result-${index}`;
        });

        assert.deepEqual(results, ['result-0', 'result-1', 'result-2']);
    });
});
