import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { withMusicDb } from '../../../src/infrastructure/musicDb/withMusicDb.js';

describe('withMusicDb', () => {
    const originalMode = process.env.MUSIC_DB_MODE;
    const originalFallback = process.env.MUSIC_DB_FALLBACK_TO_API;

    beforeEach(() => {
        process.env.MUSIC_DB_MODE = 'sqlite';
        process.env.MUSIC_DB_FALLBACK_TO_API = 'true';
    });

    afterEach(() => {
        if (originalMode === undefined) delete process.env.MUSIC_DB_MODE;
        else process.env.MUSIC_DB_MODE = originalMode;
        if (originalFallback === undefined) delete process.env.MUSIC_DB_FALLBACK_TO_API;
        else process.env.MUSIC_DB_FALLBACK_TO_API = originalFallback;
    });

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
        const result = await withMusicDb<string>(
            'op',
            () => {
                throw new Error('no such column: x');
            },
            async () => 'api',
        );

        assert.equal(result, 'api');
    });

    it('propagates the failure when fallback is disabled', async () => {
        process.env.MUSIC_DB_FALLBACK_TO_API = 'false';

        await assert.rejects(
            () =>
                withMusicDb<string>(
                    'op',
                    () => {
                        throw new Error('mirror exploded');
                    },
                    async () => 'api',
                ),
            /mirror exploded/,
        );
    });

    it('goes straight to the API when mirror mode is off', async () => {
        process.env.MUSIC_DB_MODE = 'api';
        let mirrorCalls = 0;

        const result = await withMusicDb(
            'op',
            () => {
                mirrorCalls += 1;
                return 'mirror';
            },
            async () => 'api',
        );

        assert.equal(result, 'api');
        assert.equal(mirrorCalls, 0);
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
});
