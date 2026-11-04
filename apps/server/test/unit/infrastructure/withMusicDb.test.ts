import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { withMusicDb } from '../../../src/infrastructure/musicDb/withMusicDb.js';

describe('withMusicDb', () => {
    it('uses the mirror result when it has one', async () => {
        let apiCalls = 0;
        const result = await withMusicDb(
            'op',
            () => 'mirror',
            async () => {
                apiCalls += 1;
                return 'api';
            },
        );

        assert.equal(result, 'mirror');
        assert.equal(apiCalls, 0);
    });

    it('falls back to the API on a mirror miss', async () => {
        const result = await withMusicDb(
            'op',
            () => null,
            async () => 'api',
        );

        assert.equal(result, 'api');
    });

    it('falls back to the API when the mirror throws', async () => {
        // The fallback is not configurable: a broken mirror must degrade the app,
        // never take it down, and never hide behind a feature flag nobody flips back.
        const result = await withMusicDb<string>(
            'op',
            () => {
                throw new Error('no such column: x');
            },
            async () => 'api',
        );

        assert.equal(result, 'api');
    });

    it('keeps a legitimate empty mirror result instead of calling the API', async () => {
        let apiCalls = 0;
        const result = await withMusicDb(
            'op',
            () => [],
            async () => {
                apiCalls += 1;
                return ['api'];
            },
        );

        assert.deepEqual(result, []);
        assert.equal(apiCalls, 0);
    });

    it('returns null when both sides miss', async () => {
        const result = await withMusicDb<string | null>(
            'op',
            () => null,
            async () => null,
        );

        assert.equal(result, null);
    });
});
