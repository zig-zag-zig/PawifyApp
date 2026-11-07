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
    mbid TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    disambiguation TEXT,
    type TEXT,
    begin_date TEXT,
    end_date TEXT,
    ended INTEGER NOT NULL DEFAULT 0,
    begin_area_name TEXT
);
CREATE TABLE artist_aliases (
    artist_mbid TEXT NOT NULL,
    name TEXT NOT NULL,
    PRIMARY KEY (artist_mbid, name)
);
CREATE TABLE artist_relationships (
    artist_mbid TEXT NOT NULL,
    related_artist_mbid TEXT NOT NULL,
    related_artist_name TEXT NOT NULL,
    related_artist_type TEXT,
    type TEXT NOT NULL,
    direction TEXT NOT NULL,
    begin_date TEXT,
    end_date TEXT,
    PRIMARY KEY (artist_mbid, related_artist_mbid, type, direction)
);
CREATE TABLE release_groups (
    mbid TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    primary_type TEXT,
    disambiguation TEXT,
    first_release_date TEXT
);
CREATE TABLE release_group_artists (
    release_group_mbid TEXT NOT NULL,
    artist_mbid TEXT NOT NULL,
    artist_name TEXT NOT NULL,
    join_phrase TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL
);
CREATE TABLE releases (
    mbid TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    date TEXT,
    disambiguation TEXT,
    release_group_mbid TEXT
);
CREATE TABLE release_artists (
    release_mbid TEXT NOT NULL,
    artist_mbid TEXT NOT NULL,
    artist_name TEXT NOT NULL,
    join_phrase TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL
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
CREATE VIRTUAL TABLE search_fts_release USING fts5(
    entity_mbid UNINDEXED,
    heading,
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
    externalLinks?: Record<string, unknown>[];
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

const insertRows = (
    db: Database.Database,
    table: string,
    rows: Record<string, unknown>[] | undefined,
): void => {
    if (!rows || rows.length === 0) return;

    const columns = Object.keys(rows[0]);
    const statement = db.prepare(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map((c) => `@${c}`).join(', ')})`,
    );
    for (const row of rows) {
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
    insertRows(db, 'external_links', seed.externalLinks);

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
