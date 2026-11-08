import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { closeMusicDb } from '../../../src/infrastructure/musicDb/musicDbClient.js';
import {
    readEntityImage,
    resetEntityImageRepositoryForTests,
} from '../../../src/infrastructure/musicDb/entityImageRepository.js';
import { createMusicDbFixture } from '../../helpers/musicDbFixture.js';

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

const RELEASE_ID = 'd7ffee2f-c783-4bfd-8f7c-7492675fc71f';
const GROUP_ID = 'e06540ef-1343-4c6d-982c-ed33339bbef8';
const ARTIST_ID = '66120159-5fe7-4cdb-8c9a-7ac68e393c6f';
const STALE_SECONDS = Math.floor(Date.now() / 1000) - 400 * 24 * 60 * 60;

beforeEach(() => {
    const path = createMusicDbFixture({
        artists: [{ mbid: ARTIST_ID, name: 'Czarface' }],
        releases: [{ mbid: RELEASE_ID, title: 'No Competition', release_group_mbid: GROUP_ID }],
        entityImages: [
            // Stale artist portrait: due for a background re-check.
            {
                entity_type: 'artist',
                entity_mbid: ARTIST_ID,
                service_id: 4,
                image_token: 'artist/old/1000x1000.jpg',
                fetched_at: STALE_SECONDS,
            },
        ],
    });
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

describe('bypassMirror', () => {
    it('ignores a stored artist portrait so revalidation reaches the providers', async () => {
        const { resolveArtistImage } =
            await import('../../../src/services/musicApi/artistImageSources.js');

        const mirrored = await resolveArtistImage({ artistId: ARTIST_ID });
        assert.equal(
            mirrored.image,
            'https://cdn-images.dzcdn.net/images/artist/old/1000x1000.jpg',
            'a stored row is served when the mirror is allowed',
        );

        const bypassed = await resolveArtistImage({
            artistId: ARTIST_ID,
            bypassMirror: true,
        });
        assert.equal(bypassed.image, null, 'bypassMirror must not answer from the stored row');
    });

    it('persists a resolved image back into entity_images', async () => {
        const { persistResolvedEntityImage } =
            await import('../../../src/services/musicApi/entityImageFreshness.js');

        persistResolvedEntityImage(
            'release',
            RELEASE_ID,
            'https://cdn-images.dzcdn.net/images/cover/new/1000x1000.jpg',
        );

        const row = readEntityImage('release', RELEASE_ID);
        assert.ok(row, 'a row must be written');
        assert.equal(row?.service, 'deezer');
        assert.equal(row?.url, 'https://cdn-images.dzcdn.net/images/cover/new/1000x1000.jpg');
    });
});
