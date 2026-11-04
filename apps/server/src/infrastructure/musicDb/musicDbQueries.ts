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
 * Translates user input into an FTS5 MATCH expression.
 *
 * Raw input is not safe: `version 2.0` is an FTS5 syntax error, and bare tokens
 * would be parsed as operators, so every token is quoted and given a `*` suffix
 * (prefix match, so "porcupine tr" still finds things).
 *
 * Terms are OR'ed, not AND'ed, because that is what MusicBrainz does: `q=lloyd
 * banks` matches artists containing *either* term and ranks rows containing both
 * first. AND'ing them returns 4 artists where the API returns 1881 — a search
 * regression no matter how the ranking is tuned. `bm25` already lifts rows that
 * match more terms, so plain `ORDER BY bm25(...)` reproduces that ordering.
 */
export const toFtsQuery = (query: string): string => {
    const tokens = query
        .split(/[^\p{L}\p{N}]+/u)
        .map((token) => token.trim())
        .filter((token) => token.length > 0);

    if (tokens.length === 0) {
        return '';
    }

    return tokens.map((token) => `"${token.replace(/"/g, '""')}"*`).join(' OR ');
};

/**
 * The MusicBrainz API returns `""` (not null) for "no disambiguation", and the
 * existing mappers pass that straight through to the client. The mirror column is
 * nullable, so it can hold NULL; normalising here keeps mirror payloads byte-equal
 * to the API ones instead of introducing a second "empty" representation.
 */
export const disambiguationValue = (value: string | null | undefined): string => value ?? '';

/**
 * The mirror stores "unknown" string columns as '' (NOT NULL defaults), while the
 * API omits the field entirely and the existing mappers turn that into null. These
 * two are *not* interchangeable — `disambiguation` is '', dates and names are null
 * — so nullable fields are normalised per field rather than globally.
 */
export const nullIfEmpty = (value: string | null | undefined): string | null =>
    value && value.length > 0 ? value : null;

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
    disambiguation: disambiguationValue(row.disambiguation),
    aliases: aliases.map((name) => ({ name })),
    externalLinks: mapLinks(externalLinks),
    members: relationships
        .filter((rel) => MEMBER_RELATION_TYPES.has(rel.type))
        .map((rel) => ({
            id: rel.related_artist_mbid,
            name: rel.related_artist_name,
            begin: nullIfEmpty(rel.begin_date),
            end: nullIfEmpty(rel.end_date),
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
        begin: nullIfEmpty(row.begin_date),
        end: nullIfEmpty(row.end_date),
        ended: row.ended === 1,
    },
    beginArea: {
        name: nullIfEmpty(row.begin_area_name),
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
    newest_release_date: string | null;
};

/**
 * Keyset cursor for artist release-group paging.
 *
 * `OFFSET` re-walks every skipped group, which is why the previous contract could
 * only ever return "everything". The cursor carries the last seen sort key: the
 * group's first release date and its id as the tie-break, so pages cannot overlap or
 * skip groups while the catalog changes underneath.
 */
export type ArtistReleaseGroupCursor = {
    sortDate: string | null;
    releaseGroupId: string;
};

export const readArtistReleaseGroups = (
    db: MusicDb,
    artistId: string,
    limit: number | null,
    offset: number,
    cursor?: ArtistReleaseGroupCursor | null,
): ArtistReleaseGroupRow[] => {
    // EVERY release of each group is aggregated, not just the page's rows: the
    // client taps a group and needs all of its pressings.
    //
    // Ordering is by the group's own first release date — the same key the API path
    // sorts by — not by the newest pressing, so the list order does not change when
    // a reissue lands. Groups without a date sort last.
    const cursorClause = cursor
        ? cursor.sortDate === null
            ? 'AND rg2.first_release_date IS NULL AND rg2.mbid > ?'
            : `AND (rg2.first_release_date IS NULL
                    OR rg2.first_release_date < ?
                    OR (rg2.first_release_date = ? AND rg2.mbid > ?))`
        : '';

    const sql = `
        WITH paged AS (
            SELECT DISTINCT r2.release_group_mbid AS gid, rg2.first_release_date AS sort_date
            FROM releases r2
            JOIN release_artists ra2 ON ra2.release_mbid = r2.mbid
            JOIN release_groups rg2 ON rg2.mbid = r2.release_group_mbid
            WHERE ra2.artist_mbid = ? AND r2.release_group_mbid IS NOT NULL
            ${cursorClause}
            ORDER BY sort_date IS NULL, sort_date DESC, gid ASC
            LIMIT ? OFFSET ?
        )
        SELECT rg.mbid,
               rg.title,
               rg.primary_type,
               rg.disambiguation,
               rg.first_release_date,
               group_concat(r.mbid, ' ' ORDER BY r.date IS NULL, r.date DESC, r.mbid ASC) AS release_ids,
               MAX(r.date) AS newest_release_date
        FROM paged p
        JOIN release_groups rg ON rg.mbid = p.gid
        JOIN releases r ON r.release_group_mbid = rg.mbid
        GROUP BY rg.mbid
        ORDER BY p.sort_date IS NULL, p.sort_date DESC, rg.mbid ASC`;

    const params: (string | number | null)[] = [artistId];
    if (cursor) {
        params.push(cursor.sortDate);
        if (cursor.sortDate !== null) {
            params.push(cursor.sortDate);
        }
        params.push(cursor.releaseGroupId);
    }
    params.push(limit ?? -1, offset);

    return db.prepare(sql).all(...params) as ArtistReleaseGroupRow[];
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

/**
 * Release-group ids for an artist, for seeding a newly followed artist's known set.
 *
 * Groups, not releases: the known set is group-keyed, and following an artist must
 * not notify about its back catalogue.
 */
export const readArtistReleaseGroupIds = (db: MusicDb, artistId: string): string[] =>
    (
        db
            .prepare(
                `SELECT DISTINCT r.release_group_mbid AS mbid
                 FROM releases r
                 JOIN release_artists ra ON ra.release_mbid = r.mbid
                 WHERE ra.artist_mbid = ? AND r.release_group_mbid IS NOT NULL
                 ORDER BY r.release_group_mbid`,
            )
            .all(artistId) as { mbid: string }[]
    ).map((row) => row.mbid);

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

/**
 * Maps release ids to their release-group ids.
 *
 * Used to carry a user's known-release state across the switch to group identity.
 * Unknown ids are simply absent from the result, which is what makes the
 * translation idempotent: a group id is not a release, so it misses and is kept.
 */
export const readReleaseToGroupIds = (db: MusicDb, releaseIds: readonly string[]): Map<string, string> => {
    const result = new Map<string, string>();
    if (releaseIds.length === 0) {
        return result;
    }

    // Chunked because a single statement has a bound-parameter limit (999 by
    // default), and a user can follow an artist with thousands of releases.
    const CHUNK_SIZE = 500;
    const statement = db.prepare(
        'SELECT mbid, release_group_mbid FROM releases WHERE mbid = ? AND release_group_mbid IS NOT NULL',
    );

    for (let index = 0; index < releaseIds.length; index += CHUNK_SIZE) {
        for (const releaseId of releaseIds.slice(index, index + CHUNK_SIZE)) {
            const row = statement.get(releaseId) as
                | { mbid: string; release_group_mbid: string }
                | undefined;
            if (row) {
                result.set(row.mbid, row.release_group_mbid);
            }
        }
    }

    return result;
};

export type ProviderUrlRow = { entity_mbid: string; url: string };

/**
 * Deezer/Tidal album links for a batch of releases, in one query.
 *
 * The artwork chain needs these for every release in a page, so they are loaded in
 * bulk instead of one statement per release. Matching is on host, because
 * MusicBrainz files Deezer under `free streaming` and Tidal under `streaming`
 * rather than under provider-specific relation types.
 */
export const readProviderUrlsForReleases = (
    db: MusicDb,
    releaseIds: readonly string[],
): Map<string, { deezerUrls: string[]; tidalUrls: string[] }> => {
    const result = new Map<string, { deezerUrls: string[]; tidalUrls: string[] }>();
    if (releaseIds.length === 0) {
        return result;
    }

    const statement = db.prepare(
        `SELECT entity_mbid, url FROM external_links
         WHERE entity_type = 'release' AND entity_mbid = ?
           AND (url LIKE '%deezer.com/%' OR url LIKE '%tidal.com/%')`,
    );

    for (const releaseId of releaseIds) {
        const rows = statement.all(releaseId) as ProviderUrlRow[];
        if (rows.length === 0) {
            continue;
        }

        const deezerUrls: string[] = [];
        const tidalUrls: string[] = [];
        for (const row of rows) {
            const url = row.url;
            if (url.includes('deezer.com/')) {
                deezerUrls.push(url);
            } else {
                tidalUrls.push(url);
            }
        }

        result.set(releaseId, { deezerUrls, tidalUrls });
    }

    return result;
};

/** Release ids that belong to a release group, for deriving group provider links. */
export const readReleaseIdsForGroup = (db: MusicDb, releaseGroupId: string): string[] =>
    (
        db
            .prepare('SELECT mbid FROM releases WHERE release_group_mbid = ? ORDER BY mbid')
            .all(releaseGroupId) as { mbid: string }[]
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
    date: nullIfEmpty(row.first_release_date),
    disambiguation: disambiguationValue(row.disambiguation),
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

/**
 * FTS table per entity type.
 *
 * A single table with `entity_type UNINDEXED` scanned every entity type's matches
 * and filtered afterwards; indexing that column instead tripled bm25 time on normal
 * queries. Separate tables remove the post-filter and keep ranking fast (measured
 * against the full mirror: `a` 3235ms → 303ms, `lloyd banks` 22ms → 2.5ms).
 *
 * Names come from this map, never from user input.
 */
const SEARCH_TABLES = {
    artist: 'search_fts_artist',
    release_group: 'search_fts_release_group',
} as const;

export const searchTableFor = (entityType: keyof typeof SEARCH_TABLES): string =>
    SEARCH_TABLES[entityType];

/**
 * How many matches a search is allowed to rank and count.
 *
 * Ranked search costs time proportional to the number of matches: `"the"*` finds
 * ~176k artists and scoring them all with bm25 took ~1.2 s, `"a"*` ~600k and ~3.2 s,
 * all of it blocking the event loop. Narrow queries are unaffected because they never
 * reach the budget.
 */
export const SEARCH_MAX_MATCHES = 10_000;
const SEARCH_COUNT_PROBE = SEARCH_MAX_MATCHES + 1;

/**
 * Counts matches, but stops counting once the budget is exceeded.
 *
 * The uncapped `count(*)` walks every match; the capped form returns as soon as it
 * has enough to answer "more than the budget", which is all the caller needs.
 */
export const countSearchResultsUpTo = (
    db: MusicDb,
    entityType: 'artist' | 'release_group',
    matchQuery: string,
    cap: number,
): number => {
    const table = searchTableFor(entityType);
    const row = db
        .prepare(
            `SELECT COUNT(*) AS total FROM (
                 SELECT 1 FROM ${table} WHERE ${table} MATCH ? LIMIT ?
             )`,
        )
        .get(matchQuery, cap) as { total: number } | undefined;
    return row?.total ?? 0;
};

export const searchEntities = (
    db: MusicDb,
    entityType: 'artist' | 'release_group',
    matchQuery: string,
    limit: number,
    offset: number,
): SearchRow[] => {
    const table = searchTableFor(entityType);
    return db
        .prepare(
            `SELECT entity_mbid AS mbid, heading AS title
             FROM ${table}
             WHERE ${table} MATCH ?
             ORDER BY bm25(${table}) ASC, entity_mbid ASC
             LIMIT ? OFFSET ?`,
        )
        .all(matchQuery, limit, offset) as SearchRow[];
};

export type SearchBudgetResult = {
    rows: SearchRow[];
    /** Exact for narrow queries, the cap for broad ones. */
    count: number;
    /** True when the match set exceeded the budget and results are bounded. */
    capped: boolean;
};

/**
 * Runs a search with a bounded amount of work.
 *
 * Two modes, chosen by how many rows match:
 * - narrow: bm25 ranking and an exact count, which is what a user typing an artist
 *   name expects;
 * - broad: a capped count and no ranking. Ranking ~600k rows is the expensive part,
 *   and for a query like `a` relevance is meaningless anyway. Rows come back in FTS5's
 *   natural (rowid) order, which is deterministic for an unchanged index, so
 *   pagination stays consistent.
 */
export const searchEntitiesWithBudget = (
    db: MusicDb,
    entityType: 'artist' | 'release_group',
    matchQuery: string,
    limit: number,
    offset: number,
): SearchBudgetResult => {
    const probed = countSearchResultsUpTo(db, entityType, matchQuery, SEARCH_COUNT_PROBE);

    if (probed < SEARCH_COUNT_PROBE) {
        return {
            rows: searchEntities(db, entityType, matchQuery, limit, offset),
            count: probed,
            capped: false,
        };
    }

    // Broad query: never rank, and do not let the client walk past the budget.
    if (offset >= SEARCH_MAX_MATCHES) {
        return { rows: [], count: SEARCH_MAX_MATCHES, capped: true };
    }

    const table = searchTableFor(entityType);
    const rows = db
        .prepare(
            `SELECT entity_mbid AS mbid, heading AS title
             FROM ${table}
             WHERE ${table} MATCH ?
             LIMIT ? OFFSET ?`,
        )
        .all(matchQuery, Math.min(limit, SEARCH_MAX_MATCHES - offset), offset) as SearchRow[];

    return { rows, count: SEARCH_MAX_MATCHES, capped: true };
};
