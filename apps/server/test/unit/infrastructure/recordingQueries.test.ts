import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { readRecordingSearch } from '../../../src/infrastructure/musicDb/recordingQueries.js';
import { MUSIC_DB_SCHEMA } from '../../helpers/musicDbFixture.js';

test('contentless recording search joins integer IDs and paginates deterministically', () => {
    const db = new Database(':memory:');
    try {
        db.exec(MUSIC_DB_SCHEMA);
        db.exec(`INSERT INTO artists(id,mbid,name) VALUES(1,'artist','Björk');
            INSERT INTO recordings(id,mbid,title) VALUES(17,'song','Jóga'),(18,'other','Other song');
            INSERT INTO recording_artists VALUES(17,1,'Björk','',1);
            INSERT INTO search_fts_recording(rowid,recording,recordingaccent,artist,artistname,creditname,release,comment,aux)
            VALUES(17,'Jóga','Jóga','Björk','Björk','Björk','Homogenic','',''),(18,'Other song','Other song','Someone','Someone','Someone','','','');`);
        const folded = readRecordingSearch(db, 'joga', 0, 10);
        assert.equal(folded.recordings[0].id, 'song');
        assert.equal(folded.recordings[0]['artist-credit'][0].name, 'Björk');
        assert.equal(folded.recordings[0].release, null);
        assert.deepEqual(readRecordingSearch(db, 'joga', 10, 10).recordings, []);
        assert.deepEqual(readRecordingSearch(db, '" OR -- ()', 0, 10).recordings, []);
        assert.throws(() => readRecordingSearch(db, 'joga', -1, 10));
        assert.throws(() => readRecordingSearch(db, 'joga', 0, 10000));
    } finally {
        db.close();
    }
});
