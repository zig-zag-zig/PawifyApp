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

    it('opens a freshly created database at the current version', () => {
        const databasePath = path.join(directory, 'fresh.db');
        createLyricsDatabase(databasePath);
        const db = openLyricsDb(databasePath);
        assert.equal(db.pragma('user_version', { simple: true }), LYRICS_DB_SCHEMA_VERSION);
        db.close();
    });
});
