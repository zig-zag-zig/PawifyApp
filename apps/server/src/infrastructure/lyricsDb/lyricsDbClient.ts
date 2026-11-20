import fs from 'node:fs';

import Database from 'better-sqlite3';

export type LyricsDb = Database.Database;

import { createLogger } from '../../common/logging/logger.js';
import { lyricsDbConfig } from '../../config/runtimeConfig.js';

const logger = createLogger('infrastructure.lyricsDb');

/**
 * Schema v2: three states, no timestamps beyond the retry gate.
 *
 *   lyrics_url NOT NULL                 -> resolved, permanent, never refetched
 *   lyrics_url NULL, retry_after NULL   -> nothing usable yet, retry next time
 *   lyrics_url NULL, retry_after > now  -> confirmed absent, do not retry before then
 *
 * Every other field the v1 schema carried is derivable or unnecessary: the
 * recording mbid and query fingerprint are substrings of `lookup_key`, provider
 * identity is visible in the URL's host, and a resolved lyric does not expire, so
 * there is nothing to prune. The VPS keeps this file small on purpose.
 */
export const LYRICS_DB_SCHEMA_VERSION = 2;

const SCHEMA_V2 = `
CREATE TABLE lyrics_lookup_state (
    lookup_key TEXT PRIMARY KEY,
    lyrics_url TEXT,
    retry_after INTEGER
) WITHOUT ROWID;
`;

/** Columns the current schema guarantees; also the v1 -> v2 upgrade precondition. */
const REQUIRED_COLUMNS = ['lookup_key', 'lyrics_url', 'retry_after'] as const;

const LEGACY_COLUMNS = [
    'recording_mbid',
    'query_fingerprint',
    'resolved_url',
    'provider',
    'outcome',
    'checked_at',
    'next_attempt_at',
] as const;

const columnsOf = (db: LyricsDb, table: string): string[] =>
    (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((row) => row.name);

const assertColumns = (db: Database.Database): void => {
    const columns = new Set(columnsOf(db, 'lyrics_lookup_state'));
    const missing = REQUIRED_COLUMNS.filter((column) => !columns.has(column));
    if (missing.length > 0) {
        throw new Error(
            `Lyrics database schema is incompatible; missing columns: ${missing.join(', ')}`,
        );
    }
};

/**
 * Rewrites a v1 store in place.
 *
 * The lyrics store is application-owned (unlike the sync-owned catalogue mirror),
 * so the server upgrades it on open instead of shipping a migration tool: a
 * forgotten manual step would silently disable lyric persistence.
 */
const upgradeV1ToV2 = (db: Database.Database): void => {
    const legacy = new Set(columnsOf(db, 'lyrics_lookup_state'));
    const missingLegacy = LEGACY_COLUMNS.filter((column) => !legacy.has(column));
    if (missingLegacy.length > 0) {
        throw new Error(
            `Lyrics database schema 1 is incomplete; missing columns: ${missingLegacy.join(', ')}`,
        );
    }

    db.transaction(() => {
        db.exec('CREATE TABLE lyrics_lookup_state_v2 (lookup_key TEXT PRIMARY KEY, lyrics_url TEXT, retry_after INTEGER) WITHOUT ROWID');
        // found          -> lyrics_url, no retry gate
        // confirmed-miss -> no url, retry gate carried over from next_attempt_at
        // transient      -> no url, no retry gate (retry on the next request)
        db.prepare(
            `INSERT INTO lyrics_lookup_state_v2 (lookup_key, lyrics_url, retry_after)
             SELECT lookup_key,
                    CASE WHEN outcome = 'found' THEN resolved_url END,
                    CASE WHEN outcome = 'confirmed-miss' THEN next_attempt_at END
             FROM lyrics_lookup_state`,
        ).run();
        db.exec('DROP TABLE lyrics_lookup_state');
        db.exec('ALTER TABLE lyrics_lookup_state_v2 RENAME TO lyrics_lookup_state');
    })();

    db.pragma(`user_version = ${LYRICS_DB_SCHEMA_VERSION}`);
};

const assertSchema = (db: Database.Database): void => {
    const version = db.pragma('user_version', { simple: true }) as number;
    if (version === LYRICS_DB_SCHEMA_VERSION) {
        assertColumns(db);
        return;
    }
    if (version > LYRICS_DB_SCHEMA_VERSION) {
        throw new Error(
            `Lyrics database schema version ${version} does not match expected ${LYRICS_DB_SCHEMA_VERSION}; run the lyrics DB migration`,
        );
    }
    if (version === 1) {
        upgradeV1ToV2(db);
        assertColumns(db);
        return;
    }

    // Version 0 with the full v1 column set is an unversioned v1 file: upgrade it.
    // Anything else is an unknown shape, reported through the column contract.
    const columns = new Set(columnsOf(db, 'lyrics_lookup_state'));
    if (LEGACY_COLUMNS.every((column) => columns.has(column))) {
        upgradeV1ToV2(db);
        assertColumns(db);
        return;
    }
    assertColumns(db);
};

const ensureDirectory = (databasePath: string): void => {
    const directory = databasePath.slice(0, Math.max(databasePath.lastIndexOf('/'), 0));
    if (directory && !fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
    }
};

/**
 * Creates the application-owned lyrics database.
 *
 * Called by operations once (and by tests); request handling never creates schema:
 * a missing file is an operational error, not a reason to write into an unexpected
 * location. An existing v1 store is upgraded instead of rejected.
 */
export const createLyricsDatabase = (databasePath: string): void => {
    ensureDirectory(databasePath);

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
        if (existingTable && existingVersion === LYRICS_DB_SCHEMA_VERSION) {
            // CREATE TABLE IF NOT EXISTS would be a no-op here, so the column
            // contract is checked before anything stamps a version.
            assertColumns(db);
            return;
        }
        if (existingTable) {
            assertSchema(db);
            return;
        }

        db.exec(SCHEMA_V2);
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
        assertSchema(db);
        db.pragma('journal_mode = WAL');
        db.pragma('synchronous = NORMAL');
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
        logger.error('LYRICS_DB_PATH is not set; configure the durable lyrics mount.');
        return null;
    }

    try {
        handle = openLyricsDb(lyricsDbConfig.path);
        lastFailureLogAt = 0;
        logger.info('lyrics database opened', {
            path: lyricsDbConfig.path,
            schemaVersion: LYRICS_DB_SCHEMA_VERSION,
        });
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
 * caller keeps the lookup retryable and tries again once the DB is fixed.
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
