import fs from 'node:fs';

import Database from 'better-sqlite3';

import { HttpError } from '../../common/http/errors.js';
import { createLogger } from '../../common/logging/logger.js';
import { musicDbConfig } from '../../config/runtimeConfig.js';

const logger = createLogger('infrastructure.musicDb');

export type MusicDb = Database.Database;

/**
 * Explicit operational failure for the required catalogue database.
 *
 * Mapped to HTTP 503 by the central error middleware: clients retry, and the
 * server never substitutes an empty result or a MusicBrainz Web Service lookup.
 */
export class MusicDbUnavailableError extends HttpError {
    constructor(reason: string) {
        super(503, `Music catalogue is unavailable: ${reason}`);
        this.name = 'MusicDbUnavailableError';
    }
}

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
        'id',
        'mbid',
        'name',
        'disambiguation',
        'type',
        'begin_date',
        'end_date',
        'ended',
        'begin_area_name',
    ],
    artist_aliases: ['artist_id', 'name'],
    artist_relationships: [
        'artist_id',
        'related_artist_id',
        'related_artist_mbid',
        'related_artist_name',
        'related_artist_type',
        'type',
        'direction',
        'begin_date',
        'end_date',
    ],
    release_groups: ['id', 'mbid', 'title', 'primary_type', 'disambiguation', 'first_release_date'],
    release_group_artists: [
        'release_group_id',
        'artist_id',
        'artist_name',
        'join_phrase',
        'position',
    ],
    releases: [
        'id',
        'mbid',
        'title',
        'date',
        'disambiguation',
        'release_group_mbid',
        'country',
        'barcode',
        'status',
    ],
    media: ['release_id', 'position', 'format', 'track_count', 'title'],
    recordings: ['id', 'mbid', 'title', 'length', 'disambiguation', 'first_release_date', 'video'],
    recording_artists: ['recording_id', 'artist_id', 'artist_name', 'join_phrase', 'position'],
    tracks: [
        'id',
        'release_id',
        'medium_position',
        'position',
        'number',
        'title',
        'length',
        'recording_id',
    ],
    track_artists: ['track_id', 'artist_id', 'artist_name', 'join_phrase', 'position'],
    recording_lyrics: ['recording_id', 'url', 'source'],
    release_artists: ['release_id', 'artist_id', 'artist_name', 'join_phrase', 'position'],
    external_links: ['entity_type', 'entity_mbid', 'rel_type', 'url'],
    _meta: ['key', 'value'],
    image_services: ['id', 'name', 'url_template'],
    entity_images: ['entity_type', 'entity_mbid', 'service_id', 'image_token', 'fetched_at'],
};

/**
 * Required FTS tables. Search is a catalogue feature, not an optional add-on: a
 * mirror without these cannot answer a search query and must fail readiness
 * rather than silently probing MusicBrainz.
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
    search_fts_recording: [
        'recording',
        'recordingaccent',
        'artist',
        'artistname',
        'creditname',
        'release',
        'comment',
        'aux',
    ],
};

const readColumns = (db: MusicDb, table: string): Set<string> => {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    return new Set(rows.map((row) => row.name));
};

const assertTableContract = (
    db: MusicDb,
    contract: Record<string, string[]>,
    label: string,
): void => {
    const problems: string[] = [];

    for (const [table, required] of Object.entries(contract)) {
        const columns = readColumns(db, table);
        if (columns.size === 0) {
            problems.push(`missing ${label} ${table}`);
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

const readMeta = (db: MusicDb): Record<string, string> => {
    const rows = db.prepare('SELECT key, value FROM _meta').all() as {
        key: string;
        value: string;
    }[];
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
};

const assertMirrorReady = (db: MusicDb): void => {
    const meta = readMeta(db);
    if (meta.track_data_state !== 'ready') {
        throw new Error(
            `MusicBrainz mirror track/edition data is not ready (track_data_state=${meta.track_data_state ?? 'missing'})`,
        );
    }
};

const openReadonly = (): MusicDb => {
    if (!musicDbConfig.path) {
        throw new Error('MUSIC_DB_PATH is not set');
    }
    if (!fs.existsSync(musicDbConfig.path)) {
        throw new Error(`MusicBrainz mirror not found at ${musicDbConfig.path}`);
    }

    const db = new Database(musicDbConfig.path, { readonly: true, fileMustExist: true });
    // The mirror is written hourly by a separate process on the same host, so give
    // the writer a chance rather than failing a read immediately.
    db.pragma('busy_timeout = 5000');

    try {
        assertTableContract(db, READER_CONTRACT, 'table');
        assertTableContract(db, SEARCH_TABLE_CONTRACT, 'search table');
        assertMirrorReady(db);
    } catch (error) {
        db.close();
        throw error;
    }

    const meta = readMeta(db);
    logger.info('MusicBrainz mirror opened', {
        path: musicDbConfig.path,
        trackDataState: meta.track_data_state,
        meta,
    });

    return db;
};

let handle: MusicDb | null = null;
let unavailableReason: string | null = null;

/**
 * Write handle for `entity_images` only.
 *
 * The mirror is produced by a separate tool, but artwork resolved live by this
 * server (a brand-new release, a stale artist portrait) has to be persisted
 * somewhere. Writing it back into `entity_images` keeps one source of truth and
 * stops the same lookup being repeated on every request. WAL plus a busy timeout
 * lets it coexist with the hourly `mbforge sync` writer.
 */
let writerHandle: MusicDb | null = null;
let writerLoggedFailure = false;

export const getMusicDbWriter = (): MusicDb | null => {
    if (writerHandle) {
        return writerHandle;
    }
    if (!musicDbConfig.path || !fs.existsSync(musicDbConfig.path)) {
        return null;
    }

    try {
        const db = new Database(musicDbConfig.path, { readonly: false, fileMustExist: true });
        db.pragma('busy_timeout = 5000');
        db.pragma('journal_mode = WAL');
        db.pragma('synchronous = NORMAL');

        if (!hasEntityImages(db)) {
            db.close();
            return null;
        }

        writerHandle = db;
        return db;
    } catch (error) {
        if (!writerLoggedFailure) {
            writerLoggedFailure = true;
            logger.warn('MusicBrainz mirror is not writable', {
                path: musicDbConfig.path,
                error: error instanceof Error ? error.message : String(error),
            });
        }
        return null;
    }
};

export const closeMusicDbWriter = (): void => {
    if (writerHandle) {
        writerHandle.close();
        writerHandle = null;
    }
    writerLoggedFailure = false;
};

/**
 * Opens the mirror at boot. This is fatal on purpose: a missing, corrupt or
 * unready mirror is an operational failure, not a reason to serve from the
 * MusicBrainz Web Service or to return empty catalogue data.
 */
export const initializeMusicDb = (): MusicDb => {
    try {
        handle = openReadonly();
        unavailableReason = null;
        return handle;
    } catch (error) {
        unavailableReason = error instanceof Error ? error.message : String(error);
        logger.error('MusicBrainz mirror failed to open', {
            path: musicDbConfig.path,
            error: unavailableReason,
        });
        throw new MusicDbUnavailableError(unavailableReason);
    }
};

/**
 * Returns the required mirror.
 *
 * A lazy open keeps workers/tests usable without boot wiring, but a failure is
 * never swallowed: it throws {@link MusicDbUnavailableError}, which the request
 * error middleware turns into a retriable 503.
 */
export const getMusicDb = (): MusicDb => {
    if (handle) {
        return handle;
    }

    if (unavailableReason !== null) {
        throw new MusicDbUnavailableError(unavailableReason);
    }

    try {
        handle = openReadonly();
        return handle;
    } catch (error) {
        unavailableReason = error instanceof Error ? error.message : String(error);
        logger.error('MusicBrainz mirror failed to open', {
            path: musicDbConfig.path,
            error: unavailableReason,
        });
        throw new MusicDbUnavailableError(unavailableReason);
    }
};

const hasEntityImages = (db: MusicDb): boolean => {
    const services = readColumns(db, 'image_services');
    const images = readColumns(db, 'entity_images');
    return (
        ['id', 'name', 'url_template'].every((column) => services.has(column)) &&
        ['entity_type', 'entity_mbid', 'service_id', 'image_token', 'fetched_at'].every((column) =>
            images.has(column),
        )
    );
};

/** Kept for call sites that used the old optional-table probe. */
export const musicDbHasEntityImages = (): boolean => {
    try {
        return hasEntityImages(getMusicDb());
    } catch {
        return false;
    }
};

/** Kept for call sites that used the old optional-index probe. */
export const musicDbHasSearchIndex = (): boolean => {
    try {
        getMusicDb();
        return true;
    } catch {
        return false;
    }
};

/** Kept for call sites that used the old optional-index probe. */
export const musicDbHasRecordingIndex = (): boolean => {
    try {
        getMusicDb();
        return true;
    } catch {
        return false;
    }
};

/** True once the mirror has been opened and validated by this process. */
export const isMusicDbReady = (): boolean => {
    try {
        getMusicDb();
        return true;
    } catch {
        return false;
    }
};

/** Test-only: drop the cached handle so a different file can be opened. */
export const closeMusicDb = (): void => {
    if (handle) {
        handle.close();
        handle = null;
    }
    closeMusicDbWriter();
    unavailableReason = null;
};
