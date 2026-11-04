import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { closeMusicDb } from '../../../src/infrastructure/musicDb/musicDbClient.js';
import { getArtistReleaseGroupCatalog } from '../../../src/services/musicbrainz/artistReleaseGroupCatalog.js';
import { cleanupMusicDbFixtures, createMusicDbFixture } from '../../helpers/musicDbFixture.js';

const ARTIST_ID = 'b3ae82c2-3f9e-4d3d-9f0f-0e4b2a3e0a01';
const GROUP_ID = 'e6db15f5-6c21-7a60-c232-3b7e5d6b3d04';
const GROUP_TWO_ID = 'c0bf59d9-a065-b1a4-0676-7fb291af7b08';

const seed = {
    artists: [{ mbid: ARTIST_ID, name: 'Lloyd Banks', ended: 0 }],
    releaseGroups: [
        {
            mbid: GROUP_ID,
            title: 'Hunger for More',
            primary_type: 'Album',
            disambiguation: '',
            first_release_date: '2003-04-29',
        },
        {
            mbid: GROUP_TWO_ID,
            title: 'The Course of the Inevitable',
            primary_type: 'Album',
            disambiguation: '',
            first_release_date: '2021-06-04',
        },
    ],
    releaseGroupArtists: [
        {
            release_group_mbid: GROUP_ID,
            artist_mbid: ARTIST_ID,
            artist_name: 'Lloyd Banks',
            join_phrase: '',
            position: 0,
        },
    ],
    releases: [
        {
            mbid: 'f7ec26a6-7d32-8b71-d343-4c8f6e7c4e05',
            title: 'Hunger for More',
            date: '2003-04-29',
            disambiguation: '',
            release_group_mbid: GROUP_ID,
        },
        {
            mbid: 'a8fd37b7-8e43-9c82-e454-5d907f8d5f06',
            title: 'Hunger for More',
            date: '2003-06-17',
            disambiguation: 'digital',
            release_group_mbid: GROUP_ID,
        },
        {
            mbid: 'b9ae48c8-9f54-a093-f565-6ea1809e6a07',
            title: 'The Course of the Inevitable',
            date: '2021-06-04',
            disambiguation: '',
            release_group_mbid: GROUP_TWO_ID,
        },
    ],
    releaseArtists: [
        {
            release_mbid: 'f7ec26a6-7d32-8b71-d343-4c8f6e7c4e05',
            artist_mbid: ARTIST_ID,
            artist_name: 'Lloyd Banks',
            join_phrase: '',
            position: 0,
        },
        {
            release_mbid: 'a8fd37b7-8e43-9c82-e454-5d907f8d5f06',
            artist_mbid: ARTIST_ID,
            artist_name: 'Lloyd Banks',
            join_phrase: '',
            position: 0,
        },
        {
            release_mbid: 'b9ae48c8-9f54-a093-f565-6ea1809e6a07',
            artist_mbid: ARTIST_ID,
            artist_name: 'Lloyd Banks',
            join_phrase: '',
            position: 0,
        },
    ],
};

describe('getArtistReleaseGroupCatalog', () => {
    beforeEach(() => {
        closeMusicDb();
        process.env.MUSIC_DB_PATH = createMusicDbFixture(seed);
    });

    afterEach(() => {
        closeMusicDb();
        cleanupMusicDbFixtures();
        delete process.env.MUSIC_DB_PATH;
    });

    it('returns every release of a group, not one per group', async () => {
        const catalog = await getArtistReleaseGroupCatalog(ARTIST_ID);
        const hunger = catalog.groups.find((group) => group.id === GROUP_ID);

        assert.ok(hunger);
        assert.equal(hunger.releaseIds.length, 2);
        assert.equal(hunger.title, 'Hunger for More');
        assert.equal(hunger.date, '2003-04-29');
        assert.equal(hunger.primaryType, 'Album');
    });

    it('picks the newest pressing as the representative release', async () => {
        const catalog = await getArtistReleaseGroupCatalog(ARTIST_ID);
        const hunger = catalog.groups.find((group) => group.id === GROUP_ID);

        assert.ok(hunger);
        // 2003-06-17 is the newer of the two pressings.
        assert.equal(hunger.newestReleaseId, 'a8fd37b7-8e43-9c82-e454-5d907f8d5f06');
    });

    it('orders groups newest first, like the artist screen', async () => {
        const catalog = await getArtistReleaseGroupCatalog(ARTIST_ID);

        assert.deepEqual(
            catalog.groups.map((group) => group.id),
            [GROUP_TWO_ID, GROUP_ID],
        );
    });

    it('omits credits rather than inventing them, so callers can fetch per group', async () => {
        const catalog = await getArtistReleaseGroupCatalog(ARTIST_ID);

        // The mirror path fills credits on demand for new groups only.
        assert.equal(catalog.creditsByGroupId.size, 0);
    });
});
