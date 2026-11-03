import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import Database from 'better-sqlite3';

import { closeMusicDb, getMusicDb } from '../../../src/infrastructure/musicDb/musicDbClient.js';
import {
    countArtistReleasesFromMirror,
    getArtistDetailsFromMirror,
    getArtistReleaseIdsFromMirror,
    getArtistReleasesFromMirror,
    getFollowedArtistSummaryFromMirror,
    getReleaseGroupReleasesFromMirror,
    getReleaseMetadataFromMirror,
    releaseExistsInMirror,
    searchArtistsFromMirror,
    searchReleaseGroupsFromMirror,
} from '../../../src/infrastructure/musicDb/musicDbRepositories.js';
import { toFtsQuery } from '../../../src/infrastructure/musicDb/musicDbQueries.js';
import { cleanupMusicDbFixtures, createMusicDbFixture } from '../../helpers/musicDbFixture.js';

const ARTIST_ID = 'b3ae82c2-3f9e-4d3d-9f0f-0e4b2a3e0a01';
const MEMBER_ID = 'c4bf93d3-4a0f-5e4e-a010-1f5c3b4f1b02';
const RELATED_ID = 'd5ca04e4-5b10-6f5f-b121-2a6d4c5a2c03';
const GROUP_ID = 'e6db15f5-6c21-7a60-c232-3b7e5d6b3d04';
const RELEASE_OLDER = 'f7ec26a6-7d32-8b71-d343-4c8f6e7c4e05';
const RELEASE_NEWER = 'a8fd37b7-8e43-9c82-e454-5d907f8d5f06';
const RELEASE_OTHER = 'b9ae48c8-9f54-a093-f565-6ea1809e6a07';
const GROUP_TWO_ID = 'c0bf59d9-a065-b1a4-0676-7fb291af7b08';

const seed = {
    artists: [
        {
            mbid: ARTIST_ID,
            name: 'Lloyd Banks',
            type: 'Person',
            disambiguation: null,
            begin_date: '1982-04-30',
            end_date: null,
            ended: 0,
            begin_area_name: 'New Carrollton',
        },
    ],
    artistAliases: [{ artist_mbid: ARTIST_ID, name: 'Blue Hefner' }],
    artistRelationships: [
        {
            artist_mbid: ARTIST_ID,
            related_artist_mbid: MEMBER_ID,
            related_artist_name: 'G-Unit',
            related_artist_type: 'Group',
            type: 'member of band',
            direction: 'forward',
            begin_date: '1999',
            end_date: null,
        },
        {
            artist_mbid: ARTIST_ID,
            related_artist_mbid: RELATED_ID,
            related_artist_name: '50 Cent',
            related_artist_type: 'Person',
            type: 'collaboration',
            direction: 'forward',
            begin_date: null,
            end_date: null,
        },
        {
            // Not surfaced by the client: relation types outside the supported set
            // must not leak into relatedArtists.
            artist_mbid: ARTIST_ID,
            related_artist_mbid: RELATED_ID,
            related_artist_name: '50 Cent',
            related_artist_type: 'Person',
            type: 'founder',
            direction: 'forward',
            begin_date: null,
            end_date: null,
        },
    ],
    releaseGroups: [
        {
            mbid: GROUP_ID,
            title: 'Hunger for More',
            primary_type: 'Album',
            disambiguation: null,
            first_release_date: '2003-04-29',
        },
        {
            mbid: GROUP_TWO_ID,
            title: 'The Course of the Inevitable',
            primary_type: 'Album',
            disambiguation: 'deluxe edition',
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
        {
            release_group_mbid: GROUP_TWO_ID,
            artist_mbid: ARTIST_ID,
            artist_name: 'Lloyd Banks',
            join_phrase: '',
            position: 0,
        },
    ],
    releases: [
        {
            mbid: RELEASE_OLDER,
            title: 'Hunger for More',
            date: '2003-04-29',
            disambiguation: null,
            release_group_mbid: GROUP_ID,
        },
        {
            mbid: RELEASE_NEWER,
            title: 'Hunger for More',
            date: '2003-06-17',
            disambiguation: 'digital',
            release_group_mbid: GROUP_ID,
        },
        {
            mbid: RELEASE_OTHER,
            title: 'The Course of the Inevitable',
            date: '2021-06-04',
            disambiguation: null,
            release_group_mbid: GROUP_TWO_ID,
        },
    ],
    releaseArtists: [
        {
            release_mbid: RELEASE_OLDER,
            artist_mbid: ARTIST_ID,
            artist_name: 'Lloyd Banks',
            join_phrase: '',
            position: 0,
        },
        {
            release_mbid: RELEASE_NEWER,
            artist_mbid: ARTIST_ID,
            artist_name: 'Lloyd Banks',
            join_phrase: '',
            position: 0,
        },
        {
            release_mbid: RELEASE_OTHER,
            artist_mbid: ARTIST_ID,
            artist_name: 'Lloyd Banks',
            join_phrase: 'feat.',
            position: 0,
        },
    ],
    externalLinks: [
        {
            entity_type: 'artist',
            entity_mbid: ARTIST_ID,
            rel_type: 'discogs',
            url: 'https://www.discogs.com/artist/12345',
        },
        {
            entity_type: 'artist',
            entity_mbid: ARTIST_ID,
            rel_type: 'official homepage',
            url: 'https://lloydbanks.example.com',
        },
    ],
    meta: { entities: 'artist,release-group,release', schema_sequence: '31' },
    search: [
        { entityType: 'artist', entityId: ARTIST_ID, heading: 'Lloyd Banks' },
        { entityType: 'release_group', entityId: GROUP_ID, heading: 'Hunger for More' },
        {
            entityType: 'release_group',
            entityId: GROUP_TWO_ID,
            heading: 'The Course of the Inevitable',
        },
    ],
};

const useMirror = (filePath: string): void => {
    closeMusicDb();
    process.env.MUSIC_DB_MODE = 'sqlite';
    process.env.MUSIC_DB_PATH = filePath;
    process.env.MUSIC_DB_FALLBACK_TO_API = 'true';
};

let fixturePath: string;

describe('musicDb repositories', () => {
    beforeEach(() => {
        fixturePath = createMusicDbFixture(seed);
        useMirror(fixturePath);
    });

    afterEach(() => {
        closeMusicDb();
        cleanupMusicDbFixtures();
        delete process.env.MUSIC_DB_MODE;
        delete process.env.MUSIC_DB_PATH;
        delete process.env.MUSIC_DB_FALLBACK_TO_API;
    });

    describe('client', () => {
        it('opens the mirror and reports its metadata', () => {
            assert.notEqual(getMusicDb(), null);
            assert.equal(getMusicDb()?.name, fixturePath);
        });

        it('returns null instead of throwing when the file is missing', () => {
            const missing = path.join(os.tmpdir(), `pawify-missing-${Date.now()}.db`);
            useMirror(missing);
            assert.equal(getMusicDb(), null);
        });

        it('returns null when mirror mode is off', () => {
            closeMusicDb();
            process.env.MUSIC_DB_MODE = 'api';
            assert.equal(getMusicDb(), null);
        });

        it('fails loudly when the file does not match the reader contract', () => {
            const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pawify-bad-musicdb-'));
            const badPath = path.join(directory, 'mb.db');
            const db = new Database(badPath);
            db.exec('CREATE TABLE artists (mbid TEXT PRIMARY KEY)');
            db.close();

            useMirror(badPath);
            assert.throws(
                () => getMusicDb(),
                /does not match this server's reader contract:[\s\S]*artists\.name/,
            );
            fs.rmSync(directory, { recursive: true, force: true });
        });
    });

    describe('artist details', () => {
        it('maps name, type, aliases, lifespan and begin area', () => {
            const artist = getArtistDetailsFromMirror(ARTIST_ID);

            assert.ok(artist);
            assert.equal(artist.id, ARTIST_ID);
            assert.equal(artist.name, 'Lloyd Banks');
            assert.equal(artist.type, 'Person');
            assert.deepEqual(artist.aliases, [{ name: 'Blue Hefner' }]);
            assert.deepEqual(artist.lifeSpan, {
                begin: '1982-04-30',
                end: null,
                ended: false,
            });
            assert.deepEqual(artist.beginArea, { name: 'New Carrollton' });
        });

        it('keeps member and related artists apart', () => {
            const artist = getArtistDetailsFromMirror(ARTIST_ID);

            assert.ok(artist);
            assert.deepEqual(
                artist.members?.map((member) => member.name),
                ['G-Unit'],
            );
            assert.deepEqual(
                artist.relatedArtists?.map((related) => related.name),
                ['50 Cent'],
            );
            // "founder" is outside the supported relation set.
            assert.equal(artist.relatedArtists?.length, 1);
        });

        it('maps external links including discogs', () => {
            const artist = getArtistDetailsFromMirror(ARTIST_ID);

            assert.ok(artist);
            const services = artist.externalLinks.map((link) => link.service);
            assert.ok(services.includes('discogs'));
            assert.ok(services.includes('official'));
        });

        it('returns null for an artist the mirror does not know', () => {
            assert.equal(getArtistDetailsFromMirror('unknown-artist'), null);
        });

        it('builds a followed artist summary with discogs urls', () => {
            const summary = getFollowedArtistSummaryFromMirror(ARTIST_ID);

            assert.ok(summary);
            assert.equal(summary.id, ARTIST_ID);
            assert.equal(summary.name, 'Lloyd Banks');
            assert.deepEqual(summary.discogsUrls, ['https://www.discogs.com/artist/12345']);
        });
    });

    describe('artist releases', () => {
        it('groups every release of a group, not just the newest', () => {
            const releases = getArtistReleasesFromMirror(ARTIST_ID);

            assert.ok(releases);
            const hunger = releases.find((group) => group.id === GROUP_ID);
            assert.ok(hunger);
            assert.deepEqual(hunger.releaseIds.sort(), [RELEASE_NEWER, RELEASE_OLDER].sort());
            assert.equal(hunger['primary-type'], 'Album');
            assert.equal(hunger.date, '2003-04-29');
        });

        it('orders groups newest first and reports the real total', () => {
            const releases = getArtistReleasesFromMirror(ARTIST_ID);

            assert.ok(releases);
            assert.deepEqual(
                releases.map((group) => group.id),
                [GROUP_TWO_ID, GROUP_ID],
            );
            assert.equal(countArtistReleasesFromMirror(ARTIST_ID), 2);
        });

        it('honours limit and offset so a page is a page', () => {
            const firstPage = getArtistReleasesFromMirror(ARTIST_ID, 1, 0);
            const secondPage = getArtistReleasesFromMirror(ARTIST_ID, 1, 1);

            assert.ok(firstPage);
            assert.ok(secondPage);
            assert.deepEqual(
                firstPage.map((group) => group.id),
                [GROUP_TWO_ID],
            );
            assert.deepEqual(
                secondPage.map((group) => group.id),
                [GROUP_ID],
            );
            // The group on the page still carries all of its pressings.
            assert.equal(secondPage[0].releaseIds.length, 2);
        });

        it('returns an empty list for a known artist with no releases', () => {
            const lonely = 'd1c06ae0-b176-c2b5-1787-80c3a2b08b19';
            const emptyPath = createMusicDbFixture({
                artists: [{ mbid: lonely, name: 'Nobody', ended: 0 }],
            });
            useMirror(emptyPath);

            assert.deepEqual(getArtistReleasesFromMirror(lonely), []);
            assert.equal(countArtistReleasesFromMirror(lonely), 0);
        });

        it('returns null for an artist the mirror does not know', () => {
            assert.equal(getArtistReleasesFromMirror('unknown-artist'), null);
            assert.equal(countArtistReleasesFromMirror('unknown-artist'), null);
        });

        it('lists release ids for new-release detection', () => {
            const ids = getArtistReleaseIdsFromMirror(ARTIST_ID);

            assert.ok(ids);
            assert.deepEqual(ids.sort(), [RELEASE_NEWER, RELEASE_OLDER, RELEASE_OTHER].sort());
        });
    });

    describe('release groups', () => {
        it('adds disambiguation to the release title', () => {
            const releases = getReleaseGroupReleasesFromMirror(GROUP_ID);

            assert.ok(releases);
            assert.deepEqual(releases, [
                { id: RELEASE_OLDER, title: 'Hunger for More' },
                { id: RELEASE_NEWER, title: 'Hunger for More (digital)' },
            ]);
        });

        it('returns an empty list for a known group with no releases', () => {
            const emptyGroup = 'e2d17bf1-c287-d3c6-2898-91d4b3c19c20';
            const emptyPath = createMusicDbFixture({
                releaseGroups: [{ mbid: emptyGroup, title: 'Ghost' }],
            });
            useMirror(emptyPath);

            assert.deepEqual(getReleaseGroupReleasesFromMirror(emptyGroup), []);
        });

        it('returns null for an unknown group', () => {
            assert.equal(getReleaseGroupReleasesFromMirror('unknown-group'), null);
        });
    });

    describe('release metadata', () => {
        it('returns metadata without media and with credits', () => {
            const release = getReleaseMetadataFromMirror(RELEASE_OLDER);

            assert.ok(release);
            assert.equal(release.id, RELEASE_OLDER);
            assert.equal(release.title, 'Hunger for More');
            assert.equal(release.date, '2003-04-29');
            assert.equal(release.releaseGroupId, GROUP_ID);
            assert.equal(release['release-group']?.title, 'Hunger for More');
            assert.equal(release.artistId, ARTIST_ID);
            assert.deepEqual(
                release['artist-credit'].map((credit) => credit.name),
                ['Lloyd Banks'],
            );
        });

        it('carries the join phrase into artist credits', () => {
            const release = getReleaseMetadataFromMirror(RELEASE_OTHER);

            assert.ok(release);
            assert.equal(release['artist-credit'][0].joinphrase, 'feat.');
        });

        it('returns null for an unknown release', () => {
            assert.equal(getReleaseMetadataFromMirror('unknown-release'), null);
        });

        it('answers existence checks locally', () => {
            assert.equal(releaseExistsInMirror(RELEASE_OLDER), true);
            assert.equal(releaseExistsInMirror('unknown-release'), false);
        });
    });

    describe('search', () => {
        it('escapes FTS operators in user input', () => {
            // Raw input like this is an FTS5 syntax error without quoting.
            assert.equal(toFtsQuery('version 2.0'), '"version"* "2"* "0"*');
            assert.equal(toFtsQuery('  '), '');
            assert.equal(toFtsQuery('AC/DC'), '"AC"* "DC"*');
        });

        it('finds artists by prefix', () => {
            const result = searchArtistsFromMirror('lloy', 0, 10);

            assert.ok(result);
            assert.deepEqual(result.artists, [{ id: ARTIST_ID, name: 'Lloyd Banks' }]);
            assert.equal(result.count, 1);
        });

        it('reports the unpaginated count alongside the page', () => {
            const page = searchReleaseGroupsFromMirror('inevit', 0, 1);

            assert.ok(page);
            assert.equal(page.count, 1);
            assert.equal(page.releaseGroups[0].id, GROUP_TWO_ID);
            assert.equal(page.releaseGroups[0]['primary-type'], 'Album');
            assert.equal(page.releaseGroups[0]['first-release-date'], '2021-06-04');
            assert.deepEqual(
                page.releaseGroups[0]['artist-credit'].map((credit) => credit.name),
                ['Lloyd Banks'],
            );
        });

        it('returns nothing for a query with no tokens', () => {
            assert.deepEqual(searchArtistsFromMirror('   ', 0, 10), {
                artists: [],
                count: 0,
            });
        });

        it('returns nothing when the mirror has no search index', () => {
            const noSearchPath = createMusicDbFixture({ artists: seed.artists });
            const db = new Database(noSearchPath);
            db.exec('DROP TABLE search_fts');
            db.close();
            useMirror(noSearchPath);

            assert.equal(searchArtistsFromMirror('lloy', 0, 10), null);
            assert.equal(searchReleaseGroupsFromMirror('lloy', 0, 10), null);
        });
    });
});
