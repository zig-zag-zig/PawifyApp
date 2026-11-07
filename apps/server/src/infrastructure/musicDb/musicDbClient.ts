import fs from 'node:fs';

import Database from 'better-sqlite3';

import { createLogger } from '../../common/logging/logger.js';
import { musicDbConfig } from '../../config/runtimeConfig.js';

const logger = createLogger('infrastructure.musicDb');

export type MusicDb = Database.Database;

/**
 * Columns this server reads, per table.
 *
 * The database is produced by a separate tool (zig-zag-zig/pawify_mb_sqlite), so
 * the reader contract is asserted on open: a mirror built from a different schema
 * fails loudly at startup with the exact missing column, instead of throwing
 * "no such column" from whichever request happens to hit it first.
 */
const READER_CONTRACT: Record<string, string[]> = {
    artists: [
        'mbid',
        'name',
        'disambiguation',
        'type',
        'begin_date',
        'end_date',
        'ended',
        'begin_area_name',
    ],
    artist_aliases: ['artist_mbid', 'name'],
    artist_relationships: [
        'artist_mbid',
        'related_artist_mbid',
        'related_artist_name',
        'related_artist_type',
        'type',
        'direction',
        'begin_date',
        'end_date',
    ],
    release_groups: ['mbid', 'title', 'primary_type', 'disambiguation', 'first_release_date'],
    release_group_artists: [
        'release_group_mbid',
        'artist_mbid',
        'artist_name',
        'join_phrase',
        'position',
    ],
    releases: ['mbid', 'title', 'date', 'disambiguation', 'release_group_mbid'],
    release_artists: ['release_mbid', 'artist_mbid', 'artist_name', 'join_phrase', 'position'],
    external_links: ['entity_type', 'entity_mbid', 'rel_type', 'url'],
    _meta: ['key', 'value'],
};

/**
 * Present only when the mirror's search index was built; without it search falls
 * back to the API. One table per entity type — see `musicDbQueries.SEARCH_TABLES`.
 */
/**
 * Columns required on each FTS search table; an older mirror without them must
 * cleanly fall back to the MusicBrainz API rather than fail mid-query.
 */
const SEARCH_TABLE_CONTRACT: Record<string, string[]> = {
    search_fts_artist: [
        'entity_mbid',
        'heading',
        'sortname',
        'alias',
        'primary_alias',
        'comment',
        'aux',
        'ref_count',
    ],
    search_fts_release_group: [
        'entity_mbid',
        'heading',
        'releases',
        'artistname',
        'comment',
        'aux',
        'ref_count',
    ],
};

const readColumns = (db: MusicDb, table: string): Set<string> => {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    return new Set(rows.map((row) => row.name));
};

const assertReaderContract = (db: MusicDb): void => {
    const problems: string[] = [];

    for (const [table, required] of Object.entries(READER_CONTRACT)) {
        const columns = readColumns(db, table);
        if (columns.size === 0) {
            problems.push(`missing table ${table}`);
            continue;
        }
        for (const column of required) {
            if (!columns.has(column)) {
                problems.push(`${table}.${column}`);
            }
        }
    }

    if (problems.length > 0) {
        throw new Error(
            `MusicBrainz mirror does not match this server's reader contract: ${problems.join(', ')}`,
        );
    }
};

const hasSearchIndex = (db: MusicDb): boolean => {
    const statement = db.prepare(
        `SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name=?`,
    );
    for (const [table, required] of Object.entries(SEARCH_TABLE_CONTRACT)) {
        if (statement.get(table) === undefined) {
            return false;
        }
        const columns = readColumns(db, table);
        if (required.some((column) => !columns.has(column))) {
            return false;
        }
    }
    return true;
};

const openReadonly = (): MusicDb => {
    if (!musicDbConfig.path) {
        throw new Error('MUSIC_DB_PATH is not set');
    }

    const db = new Database(musicDbConfig.path, { readonly: true, fileMustExist: true });
    // The mirror is written hourly by a separate process on the same host, so give
    // the writer a chance rather than failing a read immediately.
    db.pragma('busy_timeout = 5000');
    assertReaderContract(db);

    if (!hasSearchIndex(db)) {
        logger.warn('MusicBrainz mirror has no search index; search falls back to the API');
    }

    const meta = db.prepare('SELECT key, value FROM _meta').all() as {
        key: string;
        value: string;
    }[];
    logger.info('MusicBrainz mirror opened', {
        path: musicDbConfig.path,
        searchIndex: hasSearchIndex(db),
        meta: Object.fromEntries(meta.map((row) => [row.key, row.value])),
    });

    return db;
};

let handle: MusicDb | null = null;
let unavailableReason: string | null = null;

/**
 * Opens the mirror at boot.
 *
 * A missing file is not fatal: it is what a host without a synced mirror looks like,
 * and it must degrade to the MusicBrainz API rather than crash-loop. The flag is not
 * cached, so a mirror created later by the hourly sync is picked up without a
 * restart.
 *
 * A file that exists but does not match the reader contract *is* fatal here: serving
 * from a database whose columns moved would fail request by request with confusing
 * errors, and the stack trace at boot is the only thing that makes that obvious.
 */
export const initializeMusicDb = (): MusicDb | null => {
    if (!musicDbConfig.path) {
        logger.warn('MUSIC_DB_PATH is not set; serving from the MusicBrainz API');
        return null;
    }
    if (!fs.existsSync(musicDbConfig.path)) {
        logger.warn('MusicBrainz mirror not found at boot; serving from the MusicBrainz API', {
            path: musicDbConfig.path,
        });
        return null;
    }

    handle = openReadonly();
    unavailableReason = null;
    return handle;
};

/**
 * Lazily returns the mirror for a request path.
 *
 * Never throws: a mirror that breaks while running degrades to the API (logged as an
 * error) instead of failing user requests.
 */
export const getMusicDb = (): MusicDb | null => {
    if (handle) {
        return handle;
    }
    if (unavailableReason !== null) {
        return null;
    }

    if (!musicDbConfig.path) {
        unavailableReason = 'MUSIC_DB_PATH is not set';
        logger.warn('MUSIC_DB_PATH is not set; serving from the MusicBrainz API');
        return null;
    }
    if (!fs.existsSync(musicDbConfig.path)) {
        // Not cached: the mirror is written hourly, so it can appear after boot.
        logger.warn('MusicBrainz mirror not found; serving from the MusicBrainz API', {
            path: musicDbConfig.path,
        });
        return null;
    }

    try {
        handle = openReadonly();
    } catch (error) {
        unavailableReason = error instanceof Error ? error.message : String(error);
        logger.error('MusicBrainz mirror failed to open; serving from the MusicBrainz API', {
            path: musicDbConfig.path,
            error: unavailableReason,
        });
        return null;
    }

    return handle;
};

/** True when the mirror can answer: search needs it for its full-text index too. */
export const musicDbHasSearchIndex = (): boolean => {
    const db = getMusicDb();
    if (!db) return false;
    return hasSearchIndex(db);
};

export const isMusicDbEnabled = (): boolean => getMusicDb() !== null;

/** Test-only: drop the cached handle so a different file can be opened. */
export const closeMusicDb = (): void => {
    if (handle) {
        handle.close();
        handle = null;
    }
    unavailableReason = null;
};