import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
    closeMusicDb,
    MusicDbUnavailableError,
} from '../../../src/infrastructure/musicDb/musicDbClient.js';
import { sqliteReleaseCatalog } from '../../../src/features/releases/infrastructure/sqliteReleaseCatalog.js';
import { cleanupMusicDbFixtures, createMusicDbFixture } from '../../helpers/musicDbFixture.js';

const RELEASE_ID = 'a8fd37b7-8e43-9c82-e454-5d907f8d5f06';

describe('local release existence', () => {
    const originalPath = process.env.MUSIC_DB_PATH;

    beforeEach(() => {
        process.env.MUSIC_DB_PATH = createMusicDbFixture({
            releases: [{ id: 1, mbid: RELEASE_ID, title: 'Album' }],
        });
        closeMusicDb();
    });

    afterEach(() => {
        closeMusicDb();
        cleanupMusicDbFixtures();
        if (originalPath === undefined) delete process.env.MUSIC_DB_PATH;
        else process.env.MUSIC_DB_PATH = originalPath;
    });

    it('answers from the mirror without any MusicBrainz request', async () => {
        assert.equal(await sqliteReleaseCatalog.releaseExists(RELEASE_ID), true);
        assert.equal(await sqliteReleaseCatalog.releaseExists('missing-release'), false);
    });

    it('fails as an explicit unavailable service instead of a remote probe', async () => {
        closeMusicDb();
        delete process.env.MUSIC_DB_PATH;

        await assert.rejects(
            () => sqliteReleaseCatalog.releaseExists(RELEASE_ID),
            (error: unknown) => error instanceof MusicDbUnavailableError,
        );
    });
});
