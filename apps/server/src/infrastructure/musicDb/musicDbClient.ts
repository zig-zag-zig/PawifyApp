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

/** Present only when the mirror's search index was built; search degrades to no results. */
const SEARCH_TABLE = 'search_fts';

let handle: MusicDb | null = null;
let unavailableReason: string | null = null;

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
    const row = db
        .prepare(`SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name=?`)
        .get(SEARCH_TABLE);
    return row !== undefined;
};

/**
 * Opens the mirror read-only.
 *
 * Returns null — never throws — when mirror mode is off or the file is missing,
 * so the caller can fall back to the MusicBrainz API. A file that exists but does
 * not match the reader contract does throw: that is a misconfiguration worth
 * surfacing, not something to paper over with a silent fallback.
 */
export const getMusicDb = (): MusicDb | null => {
    if (handle) {
        return handle;
    }
    if (unavailableReason !== null) {
        return null;
    }

    if (!musicDbConfig.enabled) {
        unavailableReason = 'MUSIC_DB_MODE is not sqlite';
        return null;
    }
    if (!musicDbConfig.path) {
        unavailableReason = 'MUSIC_DB_PATH is not set';
        return null;
    }
    if (!fs.existsSync(musicDbConfig.path)) {
        unavailableReason = `mirror not found at ${musicDbConfig.path}`;
        logger.warn('MusicBrainz mirror not found; using the MusicBrainz API', {
            path: musicDbConfig.path,
        });
        return null;
    }

    const db = new Database(musicDbConfig.path, { readonly: true, fileMustExist: true });
    // The mirror is written hourly by a separate process on the same host, so give
    // the writer a chance rather than failing a read immediately.
    db.pragma('busy_timeout = 5000');
    assertReaderContract(db);

    const searchIndex = hasSearchIndex(db);
    if (!searchIndex) {
        logger.warn('MusicBrainz mirror has no search index; search falls back to the API');
    }

    const meta = db.prepare('SELECT key, value FROM _meta').all() as {
        key: string;
        value: string;
    }[];
    logger.info('MusicBrainz mirror opened', {
        path: musicDbConfig.path,
        searchIndex,
        meta: Object.fromEntries(meta.map((row) => [row.key, row.value])),
    });

    handle = db;
    return handle;
};

/** True when search can use the mirror's FTS index. */
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
