import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

/**
 * Builds a throwaway SQLite file with the same schema the mirror exporter
 * produces (the columns this server reads), plus whatever rows a test seeds.
 *
 * The schema lives here rather than being imported from the exporter because the
 * exporter is a separate repository; `musicDbClient` asserts the same contract at
 * open time, so drift between the two shows up as a failing test instead of a
 * runtime "no such column".
 */
export const MUSIC_DB_SCHEMA = `
CREATE TABLE artists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mbid TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    disambiguation TEXT,
    type TEXT,
    begin_date TEXT,
    end_date TEXT,
    ended INTEGER NOT NULL DEFAULT 0,
    begin_area_name TEXT
);
CREATE TABLE artist_aliases (
    artist_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    PRIMARY KEY (artist_id, name)
);
CREATE TABLE artist_relationships (
    artist_id INTEGER NOT NULL,
    related_artist_id INTEGER,
    related_artist_mbid TEXT NOT NULL,
    related_artist_name TEXT NOT NULL,
    related_artist_type TEXT,
    type TEXT NOT NULL,
    direction TEXT NOT NULL,
    begin_date TEXT,
    end_date TEXT,
    PRIMARY KEY (artist_id, related_artist_mbid, type, direction)
);
CREATE TABLE release_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mbid TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    primary_type TEXT,
    disambiguation TEXT,
    first_release_date TEXT
);
CREATE TABLE release_group_artists (
    release_group_id INTEGER NOT NULL,
    artist_id INTEGER NOT NULL,
    artist_name TEXT NOT NULL,
    join_phrase TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL
);
CREATE TABLE releases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mbid TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    date TEXT,
    disambiguation TEXT,
    release_group_mbid TEXT,
    country TEXT,
    barcode TEXT,
    status TEXT
);
CREATE TABLE release_artists (
    release_id INTEGER NOT NULL,
    artist_id INTEGER NOT NULL,
    artist_name TEXT NOT NULL,
    join_phrase TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL
);
CREATE INDEX idx_release_artists_artist_rel ON release_artists(artist_id, release_id);
CREATE TABLE media (
    release_id INTEGER NOT NULL REFERENCES releases(id),
    position INTEGER NOT NULL,
    format TEXT,
    track_count INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (release_id, position)
) WITHOUT ROWID;
CREATE TABLE recordings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mbid TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    length INTEGER,
    disambiguation TEXT NOT NULL DEFAULT '',
    first_release_date TEXT,
    video INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE recording_artists (
    recording_id INTEGER NOT NULL REFERENCES recordings(id),
    artist_id INTEGER NOT NULL,
    artist_name TEXT NOT NULL,
    join_phrase TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL,
    PRIMARY KEY (recording_id, position)
) WITHOUT ROWID;
CREATE TABLE tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    release_id INTEGER NOT NULL REFERENCES releases(id),
    medium_position INTEGER NOT NULL,
    position INTEGER NOT NULL,
    number TEXT NOT NULL DEFAULT '',
    title TEXT,
    length INTEGER,
    recording_id INTEGER REFERENCES recordings(id),
    UNIQUE (release_id, medium_position, position)
);
CREATE TABLE track_artists (
    track_id INTEGER NOT NULL REFERENCES tracks(id),
    artist_id INTEGER NOT NULL,
    artist_name TEXT NOT NULL,
    join_phrase TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL,
    PRIMARY KEY (track_id, position)
) WITHOUT ROWID;
CREATE TABLE recording_lyrics (
    recording_id INTEGER NOT NULL REFERENCES recordings(id),
    url TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (recording_id, url)
);
CREATE TABLE external_links (
    entity_type TEXT NOT NULL,
    entity_mbid TEXT NOT NULL,
    rel_type TEXT NOT NULL,
    url TEXT NOT NULL,
    PRIMARY KEY (entity_type, entity_mbid, rel_type, url)
);
CREATE TABLE _meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
-- Image state: the mirror builder resolves artwork once and stores the token, so
-- a page render is a primary-key lookup instead of a provider round trip.
CREATE TABLE image_services (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    url_template TEXT NOT NULL DEFAULT ''
);
CREATE TABLE entity_images (
    entity_type TEXT NOT NULL,
    entity_mbid TEXT NOT NULL,
    service_id INTEGER NOT NULL,
    image_token TEXT NOT NULL DEFAULT '',
    fetched_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (entity_type, entity_mbid)
) WITHOUT ROWID;
CREATE INDEX idx_entity_images_pending ON entity_images(entity_type, entity_mbid)
    WHERE service_id = 1;
-- Column layout matches the mirror built by pawify_mb_sqlite, which in turn mirrors
-- MusicBrainz's mbsssss fields: heading, sortname, alias, primary_alias, comment, aux.
CREATE VIRTUAL TABLE search_fts_artist USING fts5(
    entity_mbid UNINDEXED,
    heading,
    sortname,
    alias,
    primary_alias,
    comment,
    aux,
    ref_count UNINDEXED,
    tokenize = 'unicode61 remove_diacritics 2'
);
CREATE VIRTUAL TABLE search_fts_release_group USING fts5(
    entity_mbid UNINDEXED,
    heading,
    releases,
    artistname,
    comment,
    aux,
    ref_count UNINDEXED,
    tokenize = 'unicode61 remove_diacritics 2'
);
CREATE VIRTUAL TABLE search_fts_recording USING fts5(
    recording,
    recordingaccent,
    artist,
    artistname,
    creditname,
    release,
    comment,
    aux,
    content = '',
    contentless_delete = 1,
    tokenize = 'unicode61 remove_diacritics 2'
);
`;

export type MusicDbSeed = {
    artists?: Record<string, unknown>[];
    artistAliases?: Record<string, unknown>[];
    artistRelationships?: Record<string, unknown>[];
    releaseGroups?: Record<string, unknown>[];
    releaseGroupArtists?: Record<string, unknown>[];
    releases?: Record<string, unknown>[];
    releaseArtists?: Record<string, unknown>[];
    media?: Record<string, unknown>[];
    recordings?: Record<string, unknown>[];
    tracks?: Record<string, unknown>[];
    trackArtists?: Record<string, unknown>[];
    recordingArtists?: Record<string, unknown>[];
    recordingLyrics?: Record<string, unknown>[];
    externalLinks?: Record<string, unknown>[];
    /** Overrides are unnecessary in practice; kept so a test can pin a template. */
    imageServices?: Record<string, unknown>[];
    entityImages?: Record<string, unknown>[];
    meta?: Record<string, string>;
    search?: {
        entityType: string;
        entityId: string;
        heading: string;
        /** Artist ranking inputs; mirror the MusicBrainz boost fields. */
        sortName?: string;
        alias?: string;
        primaryAlias?: string;
        releases?: string;
        refCount?: number;
        artistName?: string;
    }[];
};

/**
 * Seed rows for `image_services`.
 *
 * Must stay byte-identical to the mirror exporter's seed, because the service id
 * is what `entity_images.service_id` stores.
 */
export const IMAGE_SERVICE_SEED: Array<{ id: number; name: string; url_template: string }> = [
    { id: 0, name: 'none', url_template: '' },
    { id: 1, name: 'pending', url_template: '' },
    {
        id: 2,
        name: 'caa_rel',
        url_template: 'https://coverartarchive.org/release/{token}/front-500',
    },
    {
        id: 3,
        name: 'caa_rg',
        url_template: 'https://coverartarchive.org/release-group/{token}/front-500',
    },
    { id: 4, name: 'deezer', url_template: 'https://cdn-images.dzcdn.net/images/{token}' },
    { id: 5, name: 'tidal', url_template: 'https://resources.tidal.com/images/{token}' },
    { id: 6, name: 'discogs', url_template: '{token}' },
];

// Relation tables store integer ids; test seeds are written with MBIDs for
// readability. Translate each MBID reference to the parent's integer id at insert
// time so the seeds stay declarative. related_artist_mbid is kept as a string.
const MBID_REFERENCE_COLUMNS: Record<string, Record<string, string>> = {
    artist_aliases: { artist_mbid: 'artists' },
    artist_relationships: { artist_mbid: 'artists', related_artist_mbid: 'artists' },
    release_group_artists: { release_group_mbid: 'release_groups', artist_mbid: 'artists' },
    release_artists: { release_mbid: 'releases', artist_mbid: 'artists' },
    media: { release_mbid: 'releases' },
    recording_artists: { artist_mbid: 'artists' },
    track_artists: { artist_mbid: 'artists' },
};
const INT_COLUMN_FOR: Record<string, string> = {
    artist_mbid: 'artist_id',
    related_artist_mbid: 'related_artist_id',
    release_group_mbid: 'release_group_id',
    release_mbid: 'release_id',
};

const resolveMbidReferences = (
    db: Database.Database,
    table: string,
    row: Record<string, unknown>,
): Record<string, unknown> => {
    if (table === 'tracks' && 'mbid' in row) {
        const stripped = { ...row };
        delete stripped.mbid;
        return stripped;
    }
    const references = MBID_REFERENCE_COLUMNS[table];
    if (!references) return row;
    const resolved: Record<string, unknown> = { ...row };
    for (const [column, parent] of Object.entries(references)) {
        if (!(column in resolved)) continue;
        const mbid = resolved[column];
        const intColumn = INT_COLUMN_FOR[column];
        if (table === 'artist_relationships' && column === 'related_artist_mbid') {
            // Keep the MBID string; add a nullable int id when the artist exists.
            const found = db
                .prepare(`SELECT id FROM ${parent} WHERE mbid = ?`)
                .get(mbid) as { id: number } | undefined;
            resolved[intColumn] = found?.id ?? null;
            continue;
        }
        let found = db
            .prepare(`SELECT id FROM ${parent} WHERE mbid = ?`)
            .get(mbid) as { id: number } | undefined;
        if (!found && parent === 'artists' && typeof mbid === 'string') {
            db.prepare('INSERT OR IGNORE INTO artists (mbid, name) VALUES (?, ?)').run(
                mbid,
                typeof resolved.artist_name === 'string' ? resolved.artist_name : mbid,
            );
            found = db.prepare('SELECT id FROM artists WHERE mbid = ?').get(mbid) as
                | { id: number }
                | undefined;
        }
        resolved[intColumn] = found?.id ?? null;
        delete resolved[column];
    }
    return resolved;
};

const insertRows = (
    db: Database.Database,
    table: string,
    rows: Record<string, unknown>[] | undefined,
): void => {
    if (!rows || rows.length === 0) return;

    const resolvedRows = rows.map((row) => resolveMbidReferences(db, table, row));
    const columns = Object.keys(resolvedRows[0]);
    const statement = db.prepare(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map((c) => `@${c}`).join(', ')})`,
    );
    for (const row of resolvedRows) {
        statement.run(row);
    }
};

const createdPaths: string[] = [];

export const createMusicDbFixture = (seed: MusicDbSeed = {}): string => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pawify-musicdb-'));
    const filePath = path.join(directory, 'mb.db');
    createdPaths.push(directory);

    const db = new Database(filePath);
    db.exec(MUSIC_DB_SCHEMA);

    insertRows(db, 'artists', seed.artists);
    insertRows(db, 'artist_aliases', seed.artistAliases);
    insertRows(db, 'artist_relationships', seed.artistRelationships);
    insertRows(db, 'release_groups', seed.releaseGroups);
    insertRows(db, 'release_group_artists', seed.releaseGroupArtists);
    insertRows(db, 'releases', seed.releases);
    insertRows(db, 'release_artists', seed.releaseArtists);
    insertRows(db, 'media', seed.media);
    insertRows(db, 'recordings', seed.recordings);
    insertRows(db, 'tracks', seed.tracks);
    insertRows(db, 'track_artists', seed.trackArtists);
    insertRows(db, 'recording_artists', seed.recordingArtists);
    insertRows(db, 'recording_lyrics', seed.recordingLyrics);
    insertRows(db, 'external_links', seed.externalLinks);

    const serviceStatement = db.prepare(
        'INSERT OR IGNORE INTO image_services (id, name, url_template) VALUES (?, ?, ?)',
    );
    for (const service of IMAGE_SERVICE_SEED) {
        serviceStatement.run(service.id, service.name, service.url_template);
    }
    insertRows(db, 'image_services', seed.imageServices);
    insertRows(db, 'entity_images', seed.entityImages);

    if (seed.meta) {
        const statement = db.prepare('INSERT INTO _meta (key, value) VALUES (?, ?)');
        for (const [key, value] of Object.entries(seed.meta)) {
            statement.run(key, value);
        }
    }

    if (seed.search) {
        for (const row of seed.search) {
            if (row.entityType === 'artist') {
                db.prepare(
                    `INSERT INTO search_fts_artist (entity_mbid, heading, sortname, alias, primary_alias, comment, aux, ref_count)
                     VALUES (?, ?, ?, ?, ?, '', '', ?)`,
                ).run(
                    row.entityId,
                    row.heading,
                    row.sortName ?? row.heading,
                    row.alias ?? '',
                    row.primaryAlias ?? '',
                    row.refCount ?? 100,
                );
                continue;
            }

            db.prepare(
                `INSERT INTO search_fts_release_group (entity_mbid, heading, releases, artistname, comment, aux, ref_count)
                 VALUES (?, ?, ?, ?, '', '', ?)`,
            ).run(
                row.entityId,
                row.heading,
                row.releases ?? '',
                row.artistName ?? '',
                row.refCount ?? 1,
            );
        }
    }

    db.close();
    return filePath;
};

/** Removes every fixture created by this helper. */
export const cleanupMusicDbFixtures = (): void => {
    for (const directory of createdPaths.splice(0)) {
        fs.rmSync(directory, { recursive: true, force: true });
    }
};
