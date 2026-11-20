import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { closeMusicDb } from '../../../src/infrastructure/musicDb/musicDbClient.js';
import { getReleaseMediaFromMirror } from '../../../src/infrastructure/musicDb/musicDbRepositories.js';
import { cleanupMusicDbFixtures, createMusicDbFixture } from '../../helpers/musicDbFixture.js';

const originalPath = process.env.MUSIC_DB_PATH;
after(() => {
    closeMusicDb();
    if (originalPath === undefined) delete process.env.MUSIC_DB_PATH;
    else process.env.MUSIC_DB_PATH = originalPath;
    cleanupMusicDbFixtures();
});

test('integer references stay internal and multi-medium track responses retain MBIDs', () => {
    closeMusicDb();
    process.env.MUSIC_DB_PATH = createMusicDbFixture({
        meta: { track_data_state: 'ready' },
        releases: [{ id: 41, mbid: 'release', title: 'Album' }],
        media: [
            { release_id: 41, position: 1, format: 'CD', track_count: 1 },
            { release_id: 41, position: 2, format: 'DVD', track_count: 1 },
        ],
        recordings: [{ id: 73, mbid: 'recording', title: 'Song' }],
        tracks: [
            {
                id: 91,
                mbid: 'track-one',
                release_id: 41,
                medium_position: 1,
                position: 1,
                title: 'Song',
                number: '1',
                recording_id: 73,
                length: 1000,
            },
            {
                id: 92,
                mbid: 'track-two',
                release_id: 41,
                medium_position: 2,
                position: 1,
                title: 'Video',
                number: '1',
                recording_id: 73,
                length: 2000,
            },
        ],
        trackArtists: [
            {
                track_id: 91,
                artist_mbid: 'artist',
                artist_name: 'Artist',
                join_phrase: '',
                position: 1,
            },
        ],
        recordingLyrics: [
            { recording_id: 73, url: 'https://example.org/lyrics', source: 'recording' },
        ],
    });
    const result = getReleaseMediaFromMirror('release');
    assert.ok(result);
    assert.equal(result.length, 2);
    assert.deepEqual(
        result.map((m) => m.tracks?.map((t) => t.id)),
        [['release:1:1'], ['release:2:1']],
    );
    assert.equal(result[0].tracks?.[0]['artist-credit'][0].id, 'artist');
    assert.equal(result[0].tracks?.[0].lyricsUrl, 'https://example.org/lyrics');
    assert.equal(result[1].format, 'DVD');
});

test('compacted mirrors fall back to recording title and credit', () => {
    closeMusicDb();
    process.env.MUSIC_DB_PATH = createMusicDbFixture({
        meta: { track_data_state: 'ready' },
        releases: [{ id: 51, mbid: 'rel-c', title: 'Album' }],
        media: [{ release_id: 51, position: 1, format: 'CD', track_count: 1 }],
        recordings: [{ id: 81, mbid: 'rec-c', title: 'Recording Title' }],
        // Compacted: NULL title, no track_artists rows.
        tracks: [
            {
                id: 101,
                mbid: 'track-c',
                release_id: 51,
                medium_position: 1,
                position: 1,
                title: null,
                number: '1',
                recording_id: 81,
            },
        ],
        recordingArtists: [
            {
                recording_id: 81,
                artist_mbid: 'artist-c',
                artist_name: 'Rec Artist',
                join_phrase: '',
                position: 1,
            },
        ],
    });
    const result = getReleaseMediaFromMirror('rel-c');
    assert.ok(result);
    const track = result[0].tracks?.[0];
    assert.equal(track?.title, 'Recording Title');
    assert.equal(track?.['artist-credit'][0].id, 'artist-c');
});
