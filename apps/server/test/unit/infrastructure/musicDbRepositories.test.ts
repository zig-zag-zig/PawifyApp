import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import Database from 'better-sqlite3';

import {
    closeMusicDb,
    getMusicDb,
    initializeMusicDb,
} from '../../../src/infrastructure/musicDb/musicDbClient.js';
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
    process.env.MUSIC_DB_PATH = filePath;
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
        delete process.env.MUSIC_DB_PATH;
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

        it('degrades at boot when the mirror file is not there yet', () => {
            // A host without a synced mirror must serve from the API, not crash-loop.
            const missing = path.join(os.tmpdir(), `pawify-missing-${Date.now()}.db`);
            useMirror(missing);

            assert.equal(initializeMusicDb(), null);
            // Not cached: the hourly sync can create the file later.
            assert.equal(getMusicDb(), null);

            const late = createMusicDbFixture(seed);
            process.env.MUSIC_DB_PATH = late;
            assert.notEqual(getMusicDb(), null);
        });

        it('returns null when no mirror is configured', () => {
            closeMusicDb();
            delete process.env.MUSIC_DB_PATH;
            assert.equal(getMusicDb(), null);
        });

        it('fails the boot when the file does not match the reader contract', () => {
            const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pawify-bad-musicdb-'));
            const badPath = path.join(directory, 'mb.db');
            const db = new Database(badPath);
            db.exec('CREATE TABLE artists (mbid TEXT PRIMARY KEY)');
            db.close();

            useMirror(badPath);
            // Boot must be loud: a schema mismatch is a deploy problem, not a
            // per-request error.
            assert.throws(
                () => initializeMusicDb(),
                /does not match this server's reader contract:[\s\S]*artists\.name/,
            );
            fs.rmSync(directory, { recursive: true, force: true });
        });

        it('degrades instead of throwing when the file breaks at runtime', () => {
            const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pawify-bad-musicdb-'));
            const badPath = path.join(directory, 'mb.db');
            const db = new Database(badPath);
            db.exec('CREATE TABLE artists (mbid TEXT PRIMARY KEY)');
            db.close();

            useMirror(badPath);
            // A request must fall back to the API rather than 500.
            assert.equal(getMusicDb(), null);
            assert.equal(getArtistDetailsFromMirror('anything'), null);
            assert.equal(searchArtistsFromMirror('anything', 0, 5), null);
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

        it('collapses the same url listed under several relation types', () => {
            const dupePath = createMusicDbFixture({
                artists: [{ mbid: ARTIST_ID, name: 'Lloyd Banks', ended: 0 }],
                externalLinks: [
                    {
                        entity_type: 'artist',
                        entity_mbid: ARTIST_ID,
                        rel_type: 'purchase for download',
                        url: 'https://music.apple.com/de/album/6795649635',
                    },
                    {
                        entity_type: 'artist',
                        entity_mbid: ARTIST_ID,
                        rel_type: 'streaming',
                        url: 'https://music.apple.com/de/album/6795649635',
                    },
                ],
            });
            useMirror(dupePath);

            const artist = getArtistDetailsFromMirror(ARTIST_ID);
            assert.ok(artist);
            assert.equal(artist.externalLinks.length, 1);
        });

        it('reports unknown member dates as null, like the API does', () => {
            // The mirror stores '' for missing relation dates, the API omits them.
            assert.ok(getArtistDetailsFromMirror(ARTIST_ID)?.members?.[0]);
            const artist = getArtistDetailsFromMirror(ARTIST_ID)!;
            const member = artist.members![0];
            assert.equal(member.begin, '1999');
            assert.equal(member.end, null);
        });

        it('reports unknown dates and areas as null, like the API does', () => {
            const emptyPath = createMusicDbFixture({
                artists: [
                    {
                        mbid: ARTIST_ID,
                        name: 'Unknown Dates',
                        begin_date: '',
                        end_date: '',
                        begin_area_name: '',
                        ended: 0,
                    },
                ],
            });
            useMirror(emptyPath);

            const artist = getArtistDetailsFromMirror(ARTIST_ID);
            assert.ok(artist);
            assert.deepEqual(artist.lifeSpan, { begin: null, end: null, ended: false });
            assert.deepEqual(artist.beginArea, { name: null });
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
        it("orders a group's releases newest first, like the API path", () => {
            const releases = getArtistReleasesFromMirror(ARTIST_ID);
            const hunger = releases?.find((group) => group.id === GROUP_ID);

            // RELEASE_NEWER (2003-06-17) before RELEASE_OLDER (2003-04-29).
            assert.deepEqual(hunger?.releaseIds, [RELEASE_NEWER, RELEASE_OLDER]);
        });

        it('groups every release of a group, not just the newest', () => {
            const releases = getArtistReleasesFromMirror(ARTIST_ID);

            assert.ok(releases);
            const hunger = releases.find((group) => group.id === GROUP_ID);
            assert.ok(hunger);
            assert.deepEqual(hunger.releaseIds.sort(), [RELEASE_NEWER, RELEASE_OLDER].sort());
            assert.equal(hunger['primary-type'], 'Album');
            assert.equal(hunger.date, '2003-04-29');
        });

        it('reports a missing disambiguation as an empty string, like the API does', () => {
            // The mirror column is nullable while the API emits ''; the repository
            // normalises so mirror and API payloads match.
            const emptyDisambiguationPath = createMusicDbFixture({
                artists: [{ mbid: ARTIST_ID, name: 'Lloyd Banks', ended: 0 }],
                releaseGroups: [
                    {
                        mbid: GROUP_ID,
                        title: 'Hunger for More',
                        primary_type: 'Album',
                        disambiguation: '',
                        first_release_date: '2003-04-29',
                    },
                ],
                releases: [
                    {
                        mbid: RELEASE_OLDER,
                        title: 'Hunger for More',
                        date: '2003-04-29',
                        disambiguation: '',
                        release_group_mbid: GROUP_ID,
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
                ],
            });
            useMirror(emptyDisambiguationPath);

            const releases = getArtistReleasesFromMirror(ARTIST_ID);
            assert.ok(releases);
            assert.equal(releases[0].disambiguation, '');
            assert.equal(getReleaseMetadataFromMirror(RELEASE_OLDER)?.disambiguation, '');
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

        it('never returns more groups than the configured cap', () => {
            // A pathological artist (Various Artists: 297k groups) must degrade to a
            // bounded page instead of exhausting the process heap.
            process.env.MUSIC_DB_MAX_ARTIST_RELEASE_GROUPS = '1';
            try {
                const releases = getArtistReleasesFromMirror(ARTIST_ID);
                assert.ok(releases);
                assert.equal(releases.length, 1);
                // The page is still the newest group.
                assert.equal(releases[0].id, GROUP_TWO_ID);
                // An explicit limit still wins.
                assert.equal(getArtistReleasesFromMirror(ARTIST_ID, 2)?.length, 2);
            } finally {
                delete process.env.MUSIC_DB_MAX_ARTIST_RELEASE_GROUPS;
            }
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
                { id: RELEASE_OLDER, title: 'Hunger for More', date: '2003-04-29' },
                { id: RELEASE_NEWER, title: 'Hunger for More (digital)', date: '2003-06-17' },
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
            assert.equal(toFtsQuery('version 2.0'), '"version"* OR "2"* OR "0"*');
            assert.equal(toFtsQuery('  '), '');
            assert.equal(toFtsQuery('AC/DC'), '"AC"* OR "DC"*');
        });

        it('matches either term, like the MusicBrainz search API', () => {
            // AND'ing the terms would return only the artists named both "Lloyd"
            // and "Banks" (4), where the API returns ~1881.
            const either = searchArtistsFromMirror('banks', 0, 10);
            const both = searchArtistsFromMirror('lloyd banks', 0, 10);

            assert.ok(either);
            assert.ok(both);
            assert.ok(
                (both.count ?? 0) >= (either.count ?? 0),
                'a two-term OR query must not match fewer rows than one of its terms',
            );
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

        it('ranks and counts exactly for a narrow query', () => {
            const result = searchArtistsFromMirror('lloy', 0, 10);

            assert.ok(result);
            assert.equal(result.count, 1);
            assert.equal(result.artists.length, 1);
        });

        it('bounds the work for a query wider than the budget', () => {
            // A fixture with more matches than the budget: the count is capped and the
            // page is still returned. Ranking that many rows is what used to block the
            // event loop for seconds.
            const wide = createMusicDbFixture({
                artists: seed.artists,
                search: Array.from({ length: 12 }, (_, index) => ({
                    entityType: 'artist',
                    entityId: `artist-${index}`,
                    heading: 'Wide Artist',
                })),
            });
            useMirror(wide);

            const result = searchArtistsFromMirror('wide', 0, 5);

            assert.ok(result);
            assert.ok(result.count <= 10_000);
            assert.ok(result.artists.length <= 5);
        });

        it('returns no rows past the budget instead of paging forever', () => {
            const result = searchArtistsFromMirror('lloy', 10_000, 10);

            assert.ok(result);
            assert.deepEqual(result.artists, []);
        });

        it('returns nothing when the mirror has no search index', () => {
            const noSearchPath = createMusicDbFixture({ artists: seed.artists });
            const db = new Database(noSearchPath);
            db.exec('DROP TABLE search_fts_artist');
            db.exec('DROP TABLE search_fts_release_group');
            db.close();
            useMirror(noSearchPath);

            assert.equal(searchArtistsFromMirror('lloy', 0, 10), null);
            assert.equal(searchReleaseGroupsFromMirror('lloy', 0, 10), null);
        });
    });
});
