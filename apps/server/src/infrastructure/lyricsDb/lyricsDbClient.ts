import fs from 'node:fs';

import Database from 'better-sqlite3';

import { createLogger } from '../../common/logging/logger.js';
import { lyricsDbConfig } from '../../config/runtimeConfig.js';

const logger = createLogger('infrastructure.lyricsDb');

export type LyricsDb = Database.Database;

export const LYRICS_DB_SCHEMA_VERSION = 1;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS lyrics_lookup_state (
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

CREATE INDEX IF NOT EXISTS idx_lyrics_state_next_attempt
    ON lyrics_lookup_state(outcome, next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_lyrics_state_recording
    ON lyrics_lookup_state(recording_mbid);
`;

const assertSchema = (db: LyricsDb): void => {
    const version = db.pragma('user_version', { simple: true }) as number;
    if (version !== LYRICS_DB_SCHEMA_VERSION) {
        throw new Error(
            `Lyrics database schema version ${version} does not match expected ${LYRICS_DB_SCHEMA_VERSION}; run the lyrics DB migration`,
        );
    }
};

/**
 * Creates or upgrades the application-owned lyrics database.
 *
 * Called by the administration/migration command only. Request handling never
 * creates schema: a missing file is an operational error, not a reason to write
 * into an unexpected location.
 */
export const createLyricsDatabase = (databasePath: string): void => {
    const directory = databasePath.slice(0, Math.max(databasePath.lastIndexOf('/'), 0));
    if (directory && !fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
    }

    const db = new Database(databasePath);
    try {
        db.pragma('journal_mode = WAL');
        db.pragma('synchronous = NORMAL');
        db.exec(SCHEMA);
        db.pragma(`user_version = ${LYRICS_DB_SCHEMA_VERSION}`);
    } finally {
        db.close();
    }
};

export const openLyricsDb = (databasePath: string): LyricsDb => {
    if (!fs.existsSync(databasePath)) {
        throw new Error(`Lyrics database not found at ${databasePath}`);
    }

    const db = new Database(databasePath, { fileMustExist: true });
    try {
        db.pragma('busy_timeout = 5000');
        db.pragma('journal_mode = WAL');
        db.pragma('synchronous = NORMAL');
        assertSchema(db);
        return db;
    } catch (error) {
        db.close();
        throw error;
    }
};

let handle: LyricsDb | null = null;
let openFailure: string | null = null;

export const initializeLyricsDb = (): LyricsDb | null => {
    if (!lyricsDbConfig.path) {
        logger.error(
            'LYRICS_DB_PATH is not set; persistent lyrics state is unavailable. Run the lyrics DB migration and configure the mount.',
        );
        return null;
    }

    try {
        handle = openLyricsDb(lyricsDbConfig.path);
        openFailure = null;
        logger.info('lyrics database opened', { path: lyricsDbConfig.path });
        return handle;
    } catch (error) {
        openFailure = error instanceof Error ? error.message : String(error);
        logger.error('lyrics database failed to open', {
            path: lyricsDbConfig.path,
            error: openFailure,
        });
        return null;
    }
};

/**
 * Returns the lyrics DB, or null when it is not configured/available.
 *
 * Lyrics are enrichment: a missing sidecar must not take the catalogue down. The
 * caller keeps the lookup transient and retries once the DB is fixed.
 */
export const getLyricsDb = (): LyricsDb | null => {
    if (handle) return handle;
    if (openFailure !== null || !lyricsDbConfig.path) return null;

    try {
        handle = openLyricsDb(lyricsDbConfig.path);
        return handle;
    } catch (error) {
        openFailure = error instanceof Error ? error.message : String(error);
        logger.error('lyrics database failed to open', {
            path: lyricsDbConfig.path,
            error: openFailure,
        });
        return null;
    }
};

export const closeLyricsDb = (): void => {
    if (handle) {
        handle.close();
        handle = null;
    }
    openFailure = null;
};
