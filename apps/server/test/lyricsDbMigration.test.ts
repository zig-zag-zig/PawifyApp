import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import Database from 'better-sqlite3';

import {
    createLyricsDatabase,
    LYRICS_DB_SCHEMA_VERSION,
    openLyricsDb,
} from '../src/infrastructure/lyricsDb/lyricsDbClient.js';

const LEGACY_SCHEMA = `
CREATE TABLE lyrics_lookup_state (
    lookup_key TEXT PRIMARY KEY,
    recording_mbid TEXT,
    query_fingerprint TEXT NOT NULL,
    resolved_url TEXT,
    provider TEXT,
    outcome TEXT NOT NULL CHECK (outcome IN ('found', 'confirmed-miss', 'transient-failure')),
    checked_at INTEGER NOT NULL,
    next_attempt_at INTEGER NOT NULL,
    genius_attempted_at INTEGER,
    musicbrainz_attempted_at INTEGER
) WITHOUT ROWID;
CREATE INDEX idx_lyrics_state_next_attempt ON lyrics_lookup_state(outcome, next_attempt_at);
CREATE INDEX idx_lyrics_state_recording ON lyrics_lookup_state(recording_mbid);
`;

/** Recreates a v1 store as the released server wrote it. */
const createLegacyDatabase = (databasePath: string): void => {
    const db = new Database(databasePath);
    try {
        db.exec(LEGACY_SCHEMA);
        db.pragma('user_version = 1');
    } finally {
        db.close();
    }
};

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pawify-lyrics-migrate-'));

after(() => {
    fs.rmSync(directory, { recursive: true, force: true });
});

describe('lyrics database migration safety', () => {
    it('refuses to downgrade a newer schema', () => {
        const databasePath = path.join(directory, 'newer.db');
        createLyricsDatabase(databasePath);
        const db = new Database(databasePath);
        db.pragma(`user_version = ${LYRICS_DB_SCHEMA_VERSION + 1}`);
        db.close();

        assert.throws(() => createLyricsDatabase(databasePath), /refusing to downgrade/);
        const reopened = new Database(databasePath, { readonly: true });
        assert.equal(reopened.pragma('user_version', { simple: true }), LYRICS_DB_SCHEMA_VERSION + 1);
        reopened.close();
    });

    it('refuses to stamp an incompatible existing table', () => {
        const databasePath = path.join(directory, 'incompatible.db');
        const db = new Database(databasePath);
        db.exec('CREATE TABLE lyrics_lookup_state (lookup_key TEXT PRIMARY KEY, url TEXT)');
        db.close();

        assert.throws(() => createLyricsDatabase(databasePath), /missing columns/);
        const reopened = new Database(databasePath, { readonly: true });
        assert.equal(reopened.pragma('user_version', { simple: true }), 0);
        reopened.close();
    });

    it('upgrades a v1 store, mapping the three outcomes and dropping derived columns', () => {
        const databasePath = path.join(directory, 'legacy.db');
        createLegacyDatabase(databasePath);
        const now = Date.now();
        const seed = new Database(databasePath);
        try {
            seed
                .prepare(
                    `INSERT INTO lyrics_lookup_state (
                         lookup_key, recording_mbid, query_fingerprint, resolved_url, provider,
                         outcome, checked_at, next_attempt_at, genius_attempted_at,
                         musicbrainz_attempted_at
                     ) VALUES (?, 'rec-1', 'fp-1', ?, 'genius', ?, ?, ?, ?, ?)`,
                )
                .run(
                    'recording:rec-1:fp-1',
                    'genius.com/song-a-lyrics',
                    'found',
                    now - 1000,
                    now + 90 * 24 * 60 * 60 * 1000,
                    now,
                    null,
                );
            seed
                .prepare(
                    `INSERT INTO lyrics_lookup_state (
                         lookup_key, recording_mbid, query_fingerprint, resolved_url, provider,
                         outcome, checked_at, next_attempt_at, genius_attempted_at,
                         musicbrainz_attempted_at
                     ) VALUES (?, 'rec-2', 'fp-2', NULL, NULL, 'confirmed-miss', ?, ?, ?, ?)`,
                )
                .run(
                    'recording:rec-2:fp-2',
                    now - 2000,
                    now + 7 * 24 * 60 * 60 * 1000,
                    now,
                    now,
                );
            seed
                .prepare(
                    `INSERT INTO lyrics_lookup_state (
                         lookup_key, recording_mbid, query_fingerprint, resolved_url, provider,
                         outcome, checked_at, next_attempt_at, genius_attempted_at,
                         musicbrainz_attempted_at
                     ) VALUES (?, NULL, 'fp-3', NULL, NULL, 'transient-failure', ?, ?, ?, NULL)`,
                )
                .run('query:fp-3', now - 3000, now + 5 * 60 * 1000, now);
        } finally {
            seed.close();
        }

        const db = openLyricsDb(databasePath);
        try {
            assert.equal(db.pragma('user_version', { simple: true }), LYRICS_DB_SCHEMA_VERSION);
            const columns = (db.prepare('PRAGMA table_info(lyrics_lookup_state)').all() as {
                name: string;
            }[]).map((row) => row.name);
            assert.deepEqual(columns, ['lookup_key', 'lyrics_url', 'retry_after']);
            const indexes = (
                db.prepare(`SELECT name FROM sqlite_master WHERE type = 'index'`).all() as {
                    name: string;
                }[]
            ).map((row) => row.name);
            assert.deepEqual(
                indexes.filter((name) => name.startsWith('idx_lyrics_state')),
                [],
                'secondary indexes are dropped: every read is by primary key',
            );

            const rows = db
                .prepare('SELECT lookup_key, lyrics_url, retry_after FROM lyrics_lookup_state ORDER BY lookup_key')
                .all() as { lookup_key: string; lyrics_url: string | null; retry_after: number | null }[];
            assert.equal(rows.length, 3);
            assert.deepEqual(rows[0], {
                lookup_key: 'query:fp-3',
                lyrics_url: null,
                retry_after: null,
            });
            assert.deepEqual(rows[1], {
                lookup_key: 'recording:rec-1:fp-1',
                lyrics_url: 'genius.com/song-a-lyrics',
                retry_after: null,
            });
            assert.deepEqual(rows[2], {
                lookup_key: 'recording:rec-2:fp-2',
                lyrics_url: null,
                retry_after: now + 7 * 24 * 60 * 60 * 1000,
            });
        } finally {
            db.close();
        }
    });

    it('is idempotent when the store is already current', () => {
        const databasePath = path.join(directory, 'twice.db');
        createLyricsDatabase(databasePath);
        const first = openLyricsDb(databasePath);
        first.prepare('INSERT INTO lyrics_lookup_state VALUES (?, ?, ?)').run(
            'recording:a:fp',
            '/song-lyrics',
            null,
        );
        first.close();

        createLyricsDatabase(databasePath);
        const second = openLyricsDb(databasePath);
        try {
            assert.equal(second.pragma('user_version', { simple: true }), LYRICS_DB_SCHEMA_VERSION);
            assert.deepEqual(
                second.prepare('SELECT lyrics_url FROM lyrics_lookup_state').all(),
                [{ lyrics_url: '/song-lyrics' }],
            );
        } finally {
            second.close();
        }
    });

    it('opens a freshly created database at the current version', () => {
        const databasePath = path.join(directory, 'fresh.db');
        createLyricsDatabase(databasePath);
        const db = openLyricsDb(databasePath);
        assert.equal(db.pragma('user_version', { simple: true }), LYRICS_DB_SCHEMA_VERSION);
        db.close();
    });
});
