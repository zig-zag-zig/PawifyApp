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

const REQUIRED_COLUMNS = [
    'lookup_key',
    'recording_mbid',
    'query_fingerprint',
    'resolved_url',
    'provider',
    'outcome',
    'checked_at',
    'next_attempt_at',
    'genius_attempted_at',
    'musicbrainz_attempted_at',
] as const;

const assertColumns = (db: LyricsDb): void => {
    const columns = new Set(
        (db.prepare('PRAGMA table_info(lyrics_lookup_state)').all() as { name: string }[]).map(
            (row) => row.name,
        ),
    );
    const missing = REQUIRED_COLUMNS.filter((column) => !columns.has(column));
    if (missing.length > 0) {
        throw new Error(
            `Lyrics database schema is incompatible; missing columns: ${missing.join(', ')}`,
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
        const existingVersion = db.pragma('user_version', { simple: true }) as number;
        if (existingVersion > LYRICS_DB_SCHEMA_VERSION) {
            throw new Error(
                `Lyrics database schema ${existingVersion} is newer than this server (${LYRICS_DB_SCHEMA_VERSION}); refusing to downgrade`,
            );
        }

        db.pragma('journal_mode = WAL');
        db.pragma('synchronous = NORMAL');

        const existingTable = db
            .prepare(`SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?`)
            .get('lyrics_lookup_state');
        if (existingTable) {
            // Check before running the schema: CREATE TABLE IF NOT EXISTS would be a
            // no-op and the index statements would fail with a raw SQLite error.
            assertColumns(db);
        }

        db.exec(SCHEMA);
        // A pre-existing table makes CREATE TABLE IF NOT EXISTS a no-op, so the
        // column contract is checked before stamping the version. Never relabel an
        // incompatible (or newer) database as current.
        assertColumns(db);
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
let lastFailureLogAt = 0;

const OPEN_FAILURE_LOG_INTERVAL_MS = 60_000;

export const initializeLyricsDb = (): LyricsDb | null => {
    if (!lyricsDbConfig.path) {
        logger.error(
            'LYRICS_DB_PATH is not set; persistent lyrics state is unavailable. Run the lyrics DB migration and configure the mount.',
        );
        return null;
    }

    try {
        handle = openLyricsDb(lyricsDbConfig.path);
        lastFailureLogAt = 0;
        logger.info('lyrics database opened', { path: lyricsDbConfig.path });
        return handle;
    } catch (error) {
        logger.error('lyrics database failed to open', {
            path: lyricsDbConfig.path,
            error: error instanceof Error ? error.message : String(error),
        });
        lastFailureLogAt = Date.now();
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
    if (!lyricsDbConfig.path) return null;

    // Retry on the next call: a missing/replaced file or a transient busy lock must
    // recover without a process restart. Log noise is throttled.
    try {
        handle = openLyricsDb(lyricsDbConfig.path);
        lastFailureLogAt = 0;
        return handle;
    } catch (error) {
        const now = Date.now();
        if (now - lastFailureLogAt >= OPEN_FAILURE_LOG_INTERVAL_MS) {
            lastFailureLogAt = now;
            logger.error('lyrics database failed to open', {
                path: lyricsDbConfig.path,
                error: error instanceof Error ? error.message : String(error),
            });
        }
        return null;
    }
};

export const closeLyricsDb = (): void => {
    if (handle) {
        handle.close();
        handle = null;
    }
    lastFailureLogAt = 0;
};
