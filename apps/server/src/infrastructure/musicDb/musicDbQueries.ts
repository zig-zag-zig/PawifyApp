import type { Artist, ArtistCredit, ReleaseGroup } from '@pawify/shared';

import type { MusicDb } from './musicDbClient.js';

/**
 * Relation types the client surfaces for artist discovery.
 *
 * Mirrors `RELATED_ARTIST_RELATION_TYPES` in the MusicBrainz mapper so switching
 * source cannot change which relations appear on the artist page.
 */
const RELATED_ARTIST_RELATION_TYPES = new Set([
    'collaboration',
    'remixer',
    'producer',
    'instrumental supporting musician',
    'vocal supporting musician',
    'supporting musician',
    'conductor',
    'DJ-mix',
    'samples from artist',
    'tribute',
    'is person',
    'parent',
    'sibling',
    'married',
    'named after',
    'teacher',
    'student',
    'involved with',
]);

const MEMBER_RELATION_TYPES = new Set(['member of band', 'subgroup']);

export type ArtistRelationshipRow = {
    related_artist_mbid: string;
    related_artist_name: string;
    related_artist_type: string | null;
    type: string;
    direction: string;
    begin_date: string | null;
    end_date: string | null;
};

export type ExternalLinkRow = { rel_type: string; url: string };

/**
 * Escapes user input for an FTS5 MATCH expression.
 *
 * Raw input is not safe: `version 2.0` is an FTS5 syntax error, and bare tokens
 * would be parsed as operators. Each token is quoted and given a `*` suffix so
 * "porcupine tr" behaves like a prefix search instead of an exact phrase.
 */
export const toFtsQuery = (query: string): string => {
    const tokens = query
        .split(/[^\p{L}\p{N}]+/u)
        .map((token) => token.trim())
        .filter((token) => token.length > 0);

    if (tokens.length === 0) {
        return '';
    }

    return tokens.map((token) => `"${token.replace(/"/g, '""')}"*`).join(' ');
};

export const readArtistRow = (db: MusicDb, artistId: string) =>
    db
        .prepare(
            `SELECT mbid, name, type, disambiguation, begin_date, end_date, ended, begin_area_name
             FROM artists WHERE mbid = ?`,
        )
        .get(artistId) as
        | {
              mbid: string;
              name: string;
              type: string | null;
              disambiguation: string | null;
              begin_date: string | null;
              end_date: string | null;
              ended: number;
              begin_area_name: string | null;
          }
        | undefined;

export const readArtistAliases = (db: MusicDb, artistId: string): string[] =>
    (
        db
            .prepare('SELECT name FROM artist_aliases WHERE artist_mbid = ? ORDER BY name')
            .all(artistId) as { name: string }[]
    ).map((row) => row.name);

export const readArtistRelationships = (db: MusicDb, artistId: string): ArtistRelationshipRow[] =>
    db
        .prepare(
            `SELECT related_artist_mbid, related_artist_name, related_artist_type,
                    type, direction, begin_date, end_date
             FROM artist_relationships WHERE artist_mbid = ?`,
        )
        .all(artistId) as ArtistRelationshipRow[];

export const readExternalLinks = (
    db: MusicDb,
    entityType: 'artist' | 'release',
    entityId: string,
): ExternalLinkRow[] =>
    db
        .prepare(
            `SELECT rel_type, url FROM external_links
             WHERE entity_type = ? AND entity_mbid = ? ORDER BY rel_type, url`,
        )
        .all(entityType, entityId) as ExternalLinkRow[];

export const buildArtist = (
    row: NonNullable<ReturnType<typeof readArtistRow>>,
    aliases: string[],
    relationships: ArtistRelationshipRow[],
    externalLinks: ExternalLinkRow[],
    mapLinks: (links: ExternalLinkRow[]) => Artist['externalLinks'],
): Artist => ({
    id: row.mbid,
    name: row.name,
    type: row.type as Artist['type'],
    disambiguation: row.disambiguation ?? null,
    aliases: aliases.map((name) => ({ name })),
    externalLinks: mapLinks(externalLinks),
    members: relationships
        .filter((rel) => MEMBER_RELATION_TYPES.has(rel.type))
        .map((rel) => ({
            id: rel.related_artist_mbid,
            name: rel.related_artist_name,
            begin: rel.begin_date,
            end: rel.end_date,
            artistType: (rel.related_artist_type ?? 'Person') as 'Person' | 'Group',
            type: rel.type as 'member of band' | 'subgroup',
            direction: rel.direction as 'forward' | 'backward',
        })),
    relatedArtists: relationships
        .filter((rel) => RELATED_ARTIST_RELATION_TYPES.has(rel.type))
        .map((rel) => ({
            id: rel.related_artist_mbid,
            name: rel.related_artist_name,
            type: rel.type,
            direction: rel.direction as 'forward' | 'backward',
            artistType: (rel.related_artist_type ?? 'Person') as 'Person' | 'Group',
        })),
    lifeSpan: {
        begin: row.begin_date ?? null,
        end: row.end_date ?? null,
        ended: row.ended === 1,
    },
    beginArea: {
        name: row.begin_area_name ?? null,
    },
});

/**
 * Release groups for an artist, one row per group.
 *
 * `date` is the group's first release date, matching what the MusicBrainz path
 * fills in from `release-group.first-release-date`. Grouping happens in SQL now:
 * the API path had to page through every release and collapse in memory, which is
 * why "load more" still fetched everything.
 */
export type ArtistReleaseGroupRow = {
    mbid: string;
    title: string;
    primary_type: string | null;
    disambiguation: string | null;
    first_release_date: string | null;
    release_ids: string;
};

export const readArtistReleaseGroups = (
    db: MusicDb,
    artistId: string,
    limit: number | null,
    offset: number,
): ArtistReleaseGroupRow[] => {
    // EVERY release of each group is aggregated, not just the page's rows: the
    // client taps a group and needs all of its pressings. The page itself is chosen
    // by the group's newest release date, so pages do not overlap or skip groups as
    // releases are added between requests.
    const sql = `
        WITH paged AS (
            SELECT r2.release_group_mbid AS gid, MAX(r2.date) AS newest
            FROM releases r2
            JOIN release_artists ra2 ON ra2.release_mbid = r2.mbid
            WHERE ra2.artist_mbid = ? AND r2.release_group_mbid IS NOT NULL
            GROUP BY r2.release_group_mbid
            ORDER BY newest IS NULL, newest DESC, gid ASC
            LIMIT ? OFFSET ?
        )
        SELECT rg.mbid,
               rg.title,
               rg.primary_type,
               rg.disambiguation,
               rg.first_release_date,
               group_concat(r.mbid, ' ') AS release_ids
        FROM paged p
        JOIN release_groups rg ON rg.mbid = p.gid
        JOIN releases r ON r.release_group_mbid = rg.mbid
        GROUP BY rg.mbid
        ORDER BY p.newest IS NULL, p.newest DESC, rg.mbid ASC`;

    return db.prepare(sql).all(artistId, limit ?? -1, offset) as ArtistReleaseGroupRow[];
};

export const countArtistReleaseGroups = (db: MusicDb, artistId: string): number => {
    const row = db
        .prepare(
            `SELECT COUNT(DISTINCT r.release_group_mbid) AS total
             FROM releases r
             JOIN release_artists ra ON ra.release_mbid = r.mbid
             WHERE ra.artist_mbid = ? AND r.release_group_mbid IS NOT NULL`,
        )
        .get(artistId) as { total: number } | undefined;
    return row?.total ?? 0;
};

export const readArtistReleaseIds = (db: MusicDb, artistId: string): string[] =>
    (
        db
            .prepare(
                `SELECT r.mbid FROM releases r
                 JOIN release_artists ra ON ra.release_mbid = r.mbid
                 WHERE ra.artist_mbid = ?
                 ORDER BY r.mbid`,
            )
            .all(artistId) as { mbid: string }[]
    ).map((row) => row.mbid);

export const readReleaseGroupExists = (db: MusicDb, releaseGroupId: string): boolean =>
    db.prepare('SELECT 1 FROM release_groups WHERE mbid = ?').get(releaseGroupId) !== undefined;

/** Releases in a group, ordered the way the release-group screen lists them. */
export const readReleaseGroupReleases = (
    db: MusicDb,
    releaseGroupId: string,
): { mbid: string; title: string; disambiguation: string | null; date: string | null }[] =>
    db
        .prepare(
            `SELECT mbid, title, disambiguation, date FROM releases
             WHERE release_group_mbid = ?
             ORDER BY date IS NULL, date ASC, mbid ASC`,
        )
        .all(releaseGroupId) as {
        mbid: string;
        title: string;
        disambiguation: string | null;
        date: string | null;
    }[];

export const readReleaseGroupRow = (db: MusicDb, releaseGroupId: string) =>
    db
        .prepare(
            `SELECT mbid, title, primary_type, disambiguation, first_release_date
             FROM release_groups WHERE mbid = ?`,
        )
        .get(releaseGroupId) as
        | {
              mbid: string;
              title: string;
              primary_type: string | null;
              disambiguation: string | null;
              first_release_date: string | null;
          }
        | undefined;

export const buildReleaseGroup = (row: {
    mbid: string;
    title: string;
    primary_type: string | null;
    disambiguation: string | null;
    first_release_date: string | null;
}): ReleaseGroup => ({
    id: row.mbid,
    title: row.title,
    'primary-type': row.primary_type ?? null,
    date: row.first_release_date ?? null,
    disambiguation: row.disambiguation ?? null,
});

export const readReleaseRow = (db: MusicDb, releaseId: string) =>
    db
        .prepare(
            `SELECT mbid, title, date, disambiguation, release_group_mbid
             FROM releases WHERE mbid = ?`,
        )
        .get(releaseId) as
        | {
              mbid: string;
              title: string;
              date: string | null;
              disambiguation: string | null;
              release_group_mbid: string | null;
          }
        | undefined;

export const readReleaseExists = (db: MusicDb, releaseId: string): boolean =>
    db.prepare('SELECT 1 FROM releases WHERE mbid = ?').get(releaseId) !== undefined;

export const readReleaseArtists = (db: MusicDb, releaseId: string): ArtistCredit[] =>
    (
        db
            .prepare(
                `SELECT artist_mbid, artist_name, join_phrase FROM release_artists
                 WHERE release_mbid = ? ORDER BY position`,
            )
            .all(releaseId) as { artist_mbid: string; artist_name: string; join_phrase: string }[]
    ).map((row) => ({
        id: row.artist_mbid,
        name: row.artist_name,
        joinphrase: row.join_phrase.length > 0 ? row.join_phrase : null,
    }));

export const readReleaseGroupArtists = (db: MusicDb, releaseGroupId: string): ArtistCredit[] =>
    (
        db
            .prepare(
                `SELECT artist_mbid, artist_name, join_phrase FROM release_group_artists
                 WHERE release_group_mbid = ? ORDER BY position`,
            )
            .all(releaseGroupId) as {
            artist_mbid: string;
            artist_name: string;
            join_phrase: string;
        }[]
    ).map((row) => ({
        id: row.artist_mbid,
        name: row.artist_name,
        joinphrase: row.join_phrase.length > 0 ? row.join_phrase : null,
    }));

export type SearchRow = { mbid: string; title: string };

export const searchEntities = (
    db: MusicDb,
    entityType: 'artist' | 'release_group',
    matchQuery: string,
    limit: number,
    offset: number,
): SearchRow[] =>
    db
        .prepare(
            `SELECT entity_mbid AS mbid, heading AS title
             FROM search_fts
             WHERE entity_type = ? AND search_fts MATCH ?
             ORDER BY bm25(search_fts) ASC, entity_mbid ASC
             LIMIT ? OFFSET ?`,
        )
        .all(entityType, matchQuery, limit, offset) as SearchRow[];

export const countSearchResults = (
    db: MusicDb,
    entityType: 'artist' | 'release_group',
    matchQuery: string,
): number => {
    const row = db
        .prepare(
            `SELECT COUNT(*) AS total FROM search_fts
             WHERE entity_type = ? AND search_fts MATCH ?`,
        )
        .get(entityType, matchQuery) as { total: number } | undefined;
    return row?.total ?? 0;
};
