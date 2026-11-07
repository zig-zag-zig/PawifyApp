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
        .replace(/&/g, ' and ')
        .split(/[^\p{L}\p{N}]+/u)
        .map((token) => token.trim())
        .filter((token) => token.length > 0);

    if (tokens.length === 0) {
        return '';
    }

    return tokens.map((token) => `"${token.replace(/"/g, '""')}"*`).join(' OR ');
};

const toFastCountMatchQuery = (rawQuery: string, fallbackMatchQuery: string): string => {
    const tokens = tokenizeSearchValue(rawQuery);
    const meaningful = tokens.filter((token) => token.length >= 2);
    if (meaningful.length === 0) {
        return fallbackMatchQuery;
    }

    return meaningful
        .map((token, index) => {
            const escaped = `"${token.replace(/"/g, '""')}"`;
            return index === meaningful.length - 1 && token.length >= 3 ? `${escaped}*` : escaped;
        })
        .join(' OR ');
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

/**
 * Exact heading-phrase form of a query, used as a ranking tier above bm25.
 *
 * bm25 only knows how rare a term is, so "jay z" ranked `Jay Ziskrout` and
 * `Jay-Zeezer` above `JAŸ-Z` — the local index has no popularity signal to lean on.
 * Matching the query as an adjacent phrase *in the heading* is the cheap stand-in:
 * `heading:"jay z"` matches `Jay Z`, `JAY-Z` and `JAŸ-Z` (ÿ folds to y), while
 * requiring the tokens to be a name in order rather than scattered across subtitle
 * and relation text. Deliberately not prefix-matched: `heading:"jay z"*` also pulls
 * in `Jay-Zeezer`, because the trailing token would match any `z…` word.
 */
/** Lower case, no diacritics, no punctuation: `JAŸ-Z` and `Jay Z` both become `jayz`. */
export const normalizeHeading = (value: string): string =>
    value
        .normalize('NFD')
        .replace(/\p{M}+/gu, '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, '');

export const toFtsHeadingPhrase = (query: string): string => {
    const tokens = query
        .split(/[^\p{L}\p{N}]+/u)
        .map((token) => token.trim())
        .filter((token) => token.length > 0);

    if (tokens.length < 2) {
        return '';
    }

    return `heading:"${tokens.join(' ').replace(/"/g, '""')}"`;
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

export type SearchRow = {
    mbid: string;
    title: string;
    sortname?: string;
    alias?: string;
    primaryAlias?: string;
    releases?: string;
    artistName?: string;
    refCount?: number;
    bm25Score?: number;
};

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
export const RANKED_CANDIDATE_WINDOW = 600;

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

/**
 * Column weights mirroring MusicBrainz's own search config (`metabrainz/mbsssss`,
 * `artist/conf/request-params.xml`):
 *
 *   qf = alias^1.75 primary_alias^2 artist^2 artistaccent^2.2 comment ngram^0.5 sortname^1.85
 *   bf = log(sum(ref_count,150))^4
 *
 * FTS5's bm25() takes one weight per declared column including UNINDEXED columns:
 * (entity_mbid, heading, sortname, alias, primary_alias, comment, aux, ref_count).
 */
const ARTIST_FTS_WEIGHTS = [0.0, 2.0, 1.85, 1.75, 2.0, 1.0, 0.5, 0.0] as const;

/**
 * Release-group weights from `release-group/conf/request-params.xml`:
 * releasegroup^1.5, release^1.3, artistname^1.2, comment^1.0, aux^0.5.
 * Column order: (entity_mbid, heading, releases, artistname, comment, aux, ref_count).
 */
const RELEASE_GROUP_FTS_WEIGHTS = [0.0, 1.5, 1.3, 1.2, 1.0, 0.5, 0.0] as const;

const bm25Args = (entityType: 'artist' | 'release_group', table: string): string => {
    const weights = entityType === 'artist' ? ARTIST_FTS_WEIGHTS : RELEASE_GROUP_FTS_WEIGHTS;
    return `${table}${weights.map((weight) => `, ${weight}`).join('')}`;
};

const rankExpression = (entityType: 'artist' | 'release_group', table: string): string =>
    entityType === 'artist'
        ? `(-bm25(${bm25Args(entityType, table)})) + (1.5 * ln(CAST(ref_count AS REAL) + 150))`
        : `(-bm25(${bm25Args(entityType, table)})) + (0.05 * ln(CAST(ref_count AS REAL) + 1))`;

export const searchOrderBy = (entityType: 'artist' | 'release_group', table: string): string =>
    `${rankExpression(entityType, table)} DESC, entity_mbid ASC`;

const normalizeSearchValue = (value: string): string =>
    value
        .normalize('NFD')
        .replace(/\p{M}+/gu, '')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^\p{L}\p{N}]+/gu, '');

const tokenizeSearchValue = (value: string): string[] =>
    value
        .normalize('NFD')
        .replace(/\p{M}+/gu, '')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean);

const hasTokenSequence = (haystack: string[], needle: string[]): boolean =>
    needle.length > 0 &&
    haystack.some(
        (_, index) =>
            index + needle.length <= haystack.length &&
            needle.every((token, offset) => haystack[index + offset] === token),
    );

const artistRankTuple = (row: SearchRow, queryTokens: string[], target: string): number[] => {
    const heading = normalizeSearchValue(row.title);
    const sortname = normalizeSearchValue(row.sortname ?? '');
    const headingTokens = tokenizeSearchValue(row.title);
    const sortTokens = tokenizeSearchValue(row.sortname ?? '');
    const primaryAliasTokens = tokenizeSearchValue(row.primaryAlias ?? '');
    const aliasTokens = tokenizeSearchValue(row.alias ?? '');
    const allTokens = new Set([
        ...headingTokens,
        ...sortTokens,
        ...primaryAliasTokens,
        ...aliasTokens,
    ]);

    const exactTokenMatches = queryTokens.filter((token) => allTokens.has(token)).length;
    const prefixTokenMatches = queryTokens.filter((token) =>
        [...allTokens].some((word) => word.startsWith(token)),
    ).length;

    const exactHeading = heading === target && headingTokens.length === queryTokens.length;
    const exactSortname = sortname === target && sortTokens.length === queryTokens.length;
    const exactPrimaryAlias = hasTokenSequence(primaryAliasTokens, queryTokens);
    const exactAlias = hasTokenSequence(aliasTokens, queryTokens);
    const refCount = row.refCount ?? 0;
    const isSpecial =
        (heading === 'unknown' || heading === 'variousartists' || heading === 'noartist') &&
        target !== heading;
    const singleShortToken = queryTokens.length === 1 && target.length <= 4;

    let tier = 9;
    if ((exactHeading || exactSortname) && (!singleShortToken || refCount >= 1000) && !isSpecial) {
        tier = 0;
    } else if ((exactPrimaryAlias || exactAlias) && refCount >= 1000 && !isSpecial) {
        tier = 0;
    } else if (
        singleShortToken &&
        (heading.startsWith(target) ||
            sortname.startsWith(target) ||
            headingTokens[0] === queryTokens[0] ||
            sortTokens[0] === queryTokens[0]) &&
        refCount >= 1000 &&
        !isSpecial
    ) {
        tier = 0;
    } else if ((exactHeading || exactSortname) && !isSpecial) {
        tier = 1;
    } else if ((exactPrimaryAlias || exactAlias) && refCount >= 20 && !isSpecial) {
        tier = 2;
    } else if (
        exactTokenMatches === queryTokens.length &&
        queryTokens.every((token) => headingTokens.includes(token) || sortTokens.includes(token))
    ) {
        tier = 3;
    } else if (exactTokenMatches === queryTokens.length) {
        tier = 4;
    } else if (
        prefixTokenMatches === queryTokens.length &&
        (heading.startsWith(target) || sortname.startsWith(target))
    ) {
        tier = 5;
    } else if (prefixTokenMatches === queryTokens.length) {
        tier = 6;
    }

    const combinedScore = (row.bm25Score ?? 0) + 2.5 * Math.log(refCount + 150);
    return [
        tier,
        -exactTokenMatches,
        -prefixTokenMatches,
        -Math.round(combinedScore * 1000),
        heading.length,
    ];
};

const releaseGroupRankTuple = (row: SearchRow, queryTokens: string[], target: string): number[] => {
    const heading = normalizeSearchValue(row.title);
    const artistName = normalizeSearchValue(row.artistName ?? '');
    const headingTokens = tokenizeSearchValue(row.title);
    const artistTokens = tokenizeSearchValue(row.artistName ?? '');
    const releaseTokens = tokenizeSearchValue(row.releases ?? '');
    const allTokens = new Set([...headingTokens, ...artistTokens, ...releaseTokens]);

    const exactTokenMatches = queryTokens.filter((token) => allTokens.has(token)).length;
    const prefixTokenMatches = queryTokens.filter((token) =>
        [...allTokens].some((word) => word.startsWith(token)),
    ).length;

    const exactHeading = heading === target;
    const exactArtist = artistName === target;
    const splitTitleAndArtist =
        queryTokens.length >= 2 &&
        headingTokens.length > 0 &&
        artistTokens.length > 0 &&
        headingTokens.every((token) => queryTokens.includes(token)) &&
        artistTokens.every((token) => queryTokens.includes(token)) &&
        queryTokens.every((token) => headingTokens.includes(token) || artistTokens.includes(token));

    let tier = 9;
    if (exactHeading && exactTokenMatches === queryTokens.length) {
        tier = 0;
    } else if (splitTitleAndArtist) {
        tier = 0;
    } else if (
        exactTokenMatches === queryTokens.length &&
        headingTokens.length === queryTokens.length &&
        queryTokens.every((token) => headingTokens.includes(token))
    ) {
        tier = 1;
    } else if (
        exactTokenMatches === queryTokens.length &&
        queryTokens.every((token) => headingTokens.includes(token))
    ) {
        tier = 2;
    } else if (
        exactTokenMatches === queryTokens.length &&
        queryTokens.every((token) => releaseTokens.includes(token))
    ) {
        tier = 3;
    } else if (exactTokenMatches === queryTokens.length) {
        tier = 4;
    } else if (exactArtist) {
        tier = 5;
    } else if (prefixTokenMatches === queryTokens.length && heading.startsWith(target)) {
        tier = 6;
    } else if (prefixTokenMatches === queryTokens.length) {
        tier = 7;
    }

    const refBoost = 0.25 * Math.log((row.refCount ?? 0) + 1);
    return [
        tier,
        -exactTokenMatches,
        -prefixTokenMatches,
        Math.abs(heading.length - target.length),
        -Math.round(((row.bm25Score ?? 0) + refBoost) * 1000),
    ];
};

const sortLocalSearchRows = (
    rows: SearchRow[],
    entityType: 'artist' | 'release_group',
    rawQuery: string,
): SearchRow[] => {
    const queryTokens = tokenizeSearchValue(rawQuery);
    const target = normalizeSearchValue(rawQuery);
    if (queryTokens.length === 0) {
        return rows;
    }

    return rows.sort((left, right) => {
        const a =
            entityType === 'artist'
                ? artistRankTuple(left, queryTokens, target)
                : releaseGroupRankTuple(left, queryTokens, target);
        const b =
            entityType === 'artist'
                ? artistRankTuple(right, queryTokens, target)
                : releaseGroupRankTuple(right, queryTokens, target);
        for (let index = 0; index < a.length; index += 1) {
            if (a[index] !== b[index]) {
                return a[index] - b[index];
            }
        }
        return left.mbid.localeCompare(right.mbid);
    });
};

const buildCandidateProbes = (
    entityType: 'artist' | 'release_group',
    rawQuery: string,
    phraseQuery: string,
): string[] => {
    const rawTokens = tokenizeSearchValue(rawQuery);
    const tokens = rawTokens.map((token) => `"${token.replace(/"/g, '""')}"`);
    if (tokens.length === 0) {
        return [];
    }

    const phrase = tokens.join(' ');
    const longRawTokens = rawTokens.filter((token) => token.length >= 2);
    const andSource = longRawTokens.length > 0 ? longRawTokens : rawTokens;
    const andPrefix = andSource
        .map((token, index) => {
            const escaped = `"${token.replace(/"/g, '""')}"`;
            return index === andSource.length - 1 && token.length >= 3 ? `${escaped}*` : escaped;
        })
        .join(' AND ');
    const lastPrefix =
        rawTokens.length === 1 && rawTokens[0].length >= 3 ? `heading:${phrase}*` : '';
    const sortLastPrefix =
        rawTokens.length === 1 && rawTokens[0].length >= 3 ? `sortname:${phrase}*` : '';

    const probes =
        entityType === 'artist'
            ? [
                  `heading:${phrase}`,
                  `sortname:${phrase}`,
                  `primary_alias:${phrase}`,
                  `alias:${phrase}`,
                  lastPrefix,
                  sortLastPrefix,
                  andPrefix,
              ]
            : [
                  `heading:${phrase}`,
                  `releases:${phrase}`,
                  `artistname:${phrase}`,
                  lastPrefix,
                  andPrefix,
              ];

    if (phraseQuery) {
        probes.unshift(phraseQuery);
    }
    return Array.from(new Set(probes.filter((probe) => probe.length > 0)));
};

const resolveReleaseGroupArtistAliasProbes = (db: MusicDb, rawQuery: string): string[] => {
    const tokens = tokenizeSearchValue(rawQuery).map((token) => `"${token.replace(/"/g, '""')}"`);
    if (tokens.length === 0) {
        return [];
    }

    const phrase = tokens.join(' ');
    const artistProbe = [
        `heading:${phrase}`,
        `sortname:${phrase}`,
        `primary_alias:${phrase}`,
        `alias:${phrase}`,
    ].join(' OR ');

    try {
        const rows = db
            .prepare(
                `SELECT heading, sortname
                 FROM search_fts_artist
                 WHERE search_fts_artist MATCH ?
                 ORDER BY ${searchOrderBy('artist', 'search_fts_artist')}
                 LIMIT 10`,
            )
            .all(artistProbe) as { heading: string; sortname?: string }[];

        const target = normalizeSearchValue(rawQuery);
        const queryTokens = tokenizeSearchValue(rawQuery);
        const names = new Set<string>();
        for (const row of rows) {
            const headingNorm = normalizeSearchValue(row.heading);
            const sortNorm = normalizeSearchValue(row.sortname ?? '');
            if (headingNorm === target || sortNorm === target || queryTokens.length >= 2) {
                const artistTokens = tokenizeSearchValue(row.heading).map(
                    (token) => `"${token.replace(/"/g, '""')}"`,
                );
                if (artistTokens.length > 0) {
                    names.add(`artistname:${artistTokens.join(' ')}`);
                }
            }
            if (names.size >= 3) break;
        }
        return Array.from(names);
    } catch {
        return [];
    }
};

export type RankedSearchPage = {
    /** Every ranked candidate, in final rank order. */
    rows: SearchRow[];
    /** How many rows this query can page through at all. */
    available: number;
};

/**
 * Builds the ranked candidate set for a query.
 *
 * The set is bounded on purpose: recall comes from a fixed candidate window plus a
 * handful of field/prefix probes, and the JS ranker scores all of it. Paging must
 * therefore slice *this* list instead of asking SQLite for a later offset in raw
 * bm25 order — the bm25 order is a different order, so a later SQL page would repeat
 * rows that already appeared in an earlier ranked page.
 */
export const rankSearchEntities = (
    db: MusicDb,
    entityType: 'artist' | 'release_group',
    matchQuery: string,
    phraseQuery = '',
    rawQuery = '',
    skipOrOrderBy = false,
): RankedSearchPage => {
    const table = searchTableFor(entityType);
    const columns =
        table === 'search_fts_artist'
            ? `entity_mbid AS mbid, heading AS title, sortname, alias, primary_alias AS primaryAlias, ref_count AS refCount, (-bm25(${bm25Args(entityType, table)})) AS bm25Score`
            : `entity_mbid AS mbid, heading AS title, releases, artistname AS artistName, ref_count AS refCount, (-bm25(${bm25Args(entityType, table)})) AS bm25Score`;
    const order = searchOrderBy(entityType, table);
    const selectWindow = db.prepare(
        `SELECT ${columns}
         FROM ${table}
         WHERE ${table} MATCH ?
         ORDER BY ${order}
         LIMIT ? OFFSET ?`,
    );
    const selectUnorderedWindow = db.prepare(
        `SELECT ${columns}
         FROM ${table}
         WHERE ${table} MATCH ?
         LIMIT ? OFFSET ?`,
    );

    const runQuery = (
        match: string,
        rowLimit: number,
        rowOffset: number,
        unordered = false,
    ): SearchRow[] =>
        (unordered
            ? selectUnorderedWindow.all(match, rowLimit, rowOffset)
            : selectWindow.all(match, rowLimit, rowOffset)) as SearchRow[];

    const effectiveQuery = rawQuery.trim().length > 0 ? rawQuery : matchQuery;

    const byId = new Map<string, SearchRow>();
    const addRows = (rows: SearchRow[]): void => {
        for (const row of rows) {
            if (!byId.has(row.mbid)) {
                byId.set(row.mbid, row);
            }
        }
    };

    const probes = [
        ...buildCandidateProbes(entityType, effectiveQuery, phraseQuery),
        ...(entityType === 'release_group'
            ? resolveReleaseGroupArtistAliasProbes(db, effectiveQuery)
            : []),
    ];

    for (const probe of probes) {
        try {
            addRows(runQuery(probe, 300, 0));
        } catch {
            // Ignore malformed probe syntax and rely on the main recall query.
        }
    }

    if (!skipOrOrderBy || byId.size < RANKED_CANDIDATE_WINDOW) {
        addRows(runQuery(matchQuery, RANKED_CANDIDATE_WINDOW, 0, skipOrOrderBy));
    }

    const ranked = sortLocalSearchRows(Array.from(byId.values()), entityType, effectiveQuery);
    return { rows: ranked, available: ranked.length };
};

export const searchEntities = (
    db: MusicDb,
    entityType: 'artist' | 'release_group',
    matchQuery: string,
    limit: number,
    offset: number,
    phraseQuery = '',
    rawQuery = '',
    skipOrOrderBy = false,
): SearchRow[] =>
    rankSearchEntities(db, entityType, matchQuery, phraseQuery, rawQuery, skipOrOrderBy)
        .rows.slice(offset, offset + limit);

export type SearchBudgetResult = {
    rows: SearchRow[];
    /** Rows this query can page through (bounded by the ranked candidate window). */
    count: number;
    /** True when the match set exceeded the budget and results are bounded. */
    capped: boolean;
};

/**
 * Runs a search with a bounded amount of work.
 */
export const searchEntitiesWithBudget = (
    db: MusicDb,
    entityType: 'artist' | 'release_group',
    matchQuery: string,
    limit: number,
    offset: number,
    phraseQuery = '',
    rawQuery = '',
): SearchBudgetResult => {
    const countQuery = rawQuery.trim().length > 0 ? toFastCountMatchQuery(rawQuery, matchQuery) : matchQuery;
    const probed = countSearchResultsUpTo(db, entityType, countQuery, SEARCH_COUNT_PROBE);
    const capped = probed >= SEARCH_COUNT_PROBE;

    // The ranked candidate set is the pageable universe. Reporting the FTS match
    // count instead would advertise rows no page can ever reach, leaving "Load
    // more" visible (and returning duplicates) forever.
    const page = rankSearchEntities(
        db,
        entityType,
        countQuery,
        phraseQuery,
        rawQuery,
        capped,
    );

    return {
        rows: page.rows.slice(offset, offset + limit),
        count: Math.min(page.available, SEARCH_MAX_MATCHES),
        capped,
    };
};
