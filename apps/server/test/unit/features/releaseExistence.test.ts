import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { closeMusicDb } from '../../../src/infrastructure/musicDb/musicDbClient.js';
import { resolveReleaseExistence } from '../../../src/features/releases/infrastructure/musicBrainzReleaseCatalog.js';
import { cleanupMusicDbFixtures, createMusicDbFixture } from '../../helpers/musicDbFixture.js';

const RELEASE_ID = 'a8fd37b7-8e43-9c82-e454-5d907f8d5f06';

describe('resolveReleaseExistence', () => {
    const originalMode = process.env.MUSIC_DB_MODE;
    const originalFallback = process.env.MUSIC_DB_FALLBACK_TO_API;
    const originalPath = process.env.MUSIC_DB_PATH;

    beforeEach(() => {
        process.env.MUSIC_DB_MODE = 'sqlite';
        process.env.MUSIC_DB_FALLBACK_TO_API = 'true';
        process.env.MUSIC_DB_PATH = createMusicDbFixture();
        closeMusicDb();
    });

    afterEach(() => {
        closeMusicDb();
        cleanupMusicDbFixtures();
        if (originalMode === undefined) delete process.env.MUSIC_DB_MODE;
        else process.env.MUSIC_DB_MODE = originalMode;
        if (originalFallback === undefined) delete process.env.MUSIC_DB_FALLBACK_TO_API;
        else process.env.MUSIC_DB_FALLBACK_TO_API = originalFallback;
        if (originalPath === undefined) delete process.env.MUSIC_DB_PATH;
        else process.env.MUSIC_DB_PATH = originalPath;
    });

    it('answers a mirror hit without calling the API', async () => {
        let apiCalls = 0;
        const exists = await resolveReleaseExistence(
            RELEASE_ID,
            () => true,
            async () => {
                apiCalls += 1;
                return false;
            },
        );

        assert.equal(exists, true);
        assert.equal(apiCalls, 0);
    });

    it('verifies a mirror miss with the API instead of trusting the mirror', async () => {
        // The mirror can be an hour behind, and a false answer deletes user state.
        let askedApi = '';
        const exists = await resolveReleaseExistence(
            RELEASE_ID,
            () => false,
            async (releaseId) => {
                askedApi = releaseId;
                return true;
            },
        );

        assert.equal(exists, true);
        assert.equal(askedApi, RELEASE_ID);
    });

    it('returns false when both the mirror and the API say the release is gone', async () => {
        const exists = await resolveReleaseExistence(
            RELEASE_ID,
            () => false,
            async () => false,
        );

        assert.equal(exists, false);
    });

    it('falls back to the API when the mirror check throws', async () => {
        const exists = await resolveReleaseExistence(
            RELEASE_ID,
            () => {
                throw new Error('disk is gone');
            },
            async () => true,
        );

        assert.equal(exists, true);
    });

    it('propagates a mirror failure when fallback is disabled', async () => {
        process.env.MUSIC_DB_FALLBACK_TO_API = 'false';

        await assert.rejects(
            () =>
                resolveReleaseExistence(
                    RELEASE_ID,
                    () => {
                        throw new Error('disk is gone');
                    },
                    async () => true,
                ),
            /disk is gone/,
        );
    });

    it('goes straight to the API when mirror mode is off', async () => {
        closeMusicDb();
        process.env.MUSIC_DB_MODE = 'api';
        let mirrorCalls = 0;

        const exists = await resolveReleaseExistence(
            RELEASE_ID,
            () => {
                mirrorCalls += 1;
                return true;
            },
            async () => false,
        );

        assert.equal(exists, false);
        assert.equal(mirrorCalls, 0);
    });
});
