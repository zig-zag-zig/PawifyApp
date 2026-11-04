import type { Artist, ArtistCredit, Release, ReleaseGroup } from '@pawify/shared';

import type { CachedArtistReleases } from '../../utils/types/cacheTypes.js';
import type { ReleaseGroupCandidate } from '../../features/releases/domain/releaseGroupProcessing.js';
import type { ArtistSearchResult } from '../../services/musicbrainz/artistSearch.js';
import type { ReleaseGroupSearchResult } from '../../services/musicbrainz/releaseGroupSearch.js';
import type { FollowedArtistSummary } from '../../utils/types/followedArtistTypes.js';
import {
    dedupeExternalLinks,
    getExternalLinkUrlsByService,
    mapUrlsToExternalLinks,
} from '../../utils/helpers/externalLinks.js';
import { formatDate, nameWithDisambiguation } from '@pawify/shared';
import { getMusicDb, isMusicDbEnabled, musicDbHasSearchIndex } from './musicDbClient.js';
import { musicDbConfig } from '../../config/runtimeConfig.js';
import { createLogger } from '../../common/logging/logger.js';

const logger = createLogger('infrastructure.musicDb.repositories');
import {
    buildArtist,
    buildReleaseGroup,
    disambiguationValue,
    nullIfEmpty,
    countArtistReleaseGroups,
    readArtistAliases,
    readArtistRelationships,
    readArtistReleaseGroups,
    readArtistReleaseGroupIds,
    readArtistReleaseIds,
    readArtistRow,
    readExternalLinks,
    readReleaseArtists,
    readProviderUrlsForReleases,
    readReleaseExists,
    readReleaseGroupArtists,
    readReleaseGroupExists,
    readReleaseGroupReleases,
    readReleaseGroupRow,
    readReleaseIdsForGroup,
    readReleaseToGroupIds,
    readReleaseRow,
    searchEntitiesWithBudget,
    toFtsQuery,
    type ExternalLinkRow,
} from './musicDbQueries.js';

/**
 * Builds external links from mirror rows.
 *
 * The same URL appears once per relation type in the mirror (a store page is both
 * "purchase for download" and "streaming"), while the API path returns one link
 * per URL. Mapping each row and then running the API's own dedupe keeps the two
 * sources identical instead of returning duplicate links.
 */
const linksFromRows = (rows: ExternalLinkRow[]) =>
    dedupeExternalLinks(rows.flatMap((row) => mapUrlsToExternalLinks([row.url], row.rel_type)));

/**
 * Release groups for an artist.
 *
 * The MusicBrainz path had to page through every release and collapse them in
 * memory, so "load more" never actually reduced the work. With the mirror the
 * grouping happens in SQL and a page is a page.
 */
export const getArtistReleasesFromMirror = (
    artistId: string,
    limit: number | null = null,
    offset = 0,
    cursor?: { sortDate: string | null; releaseGroupId: string } | null,
): CachedArtistReleases | null => {
    const db = getMusicDb();
    if (!db) return null;

    // Ask for one extra row than the page size: that is how truncation is detected
    // without a second (expensive) count query.
    const configuredCap = musicDbConfig.maxArtistReleaseGroups;
    const pageSize = limit ?? (configuredCap > 0 ? configuredCap : null);
    const rows = readArtistReleaseGroups(
        db,
        artistId,
        pageSize === null ? null : pageSize + 1,
        offset,
        cursor,
    );
    if (pageSize !== null && rows.length > pageSize) {
        rows.length = pageSize;
        logger.warn('artist has more release groups than one page; returning the newest', {
            artistId,
            pageSize,
            offset,
        });
    }
    if (rows.length === 0) {
        // Distinguish "artist genuinely has no releases" from "mirror does not know
        // this artist" so the caller can decide whether to fall back.
        const artist = readArtistRow(db, artistId);
        return artist ? [] : null;
    }

    return rows.map((row) => ({
        id: row.mbid,
        title: row.title,
        'primary-type': row.primary_type ?? null,
        date: nullIfEmpty(row.first_release_date),
        disambiguation: disambiguationValue(row.disambiguation),
        releaseIds: row.release_ids.split(' ').filter(Boolean),
    }));
};

/**
 * Artist release groups with their newest pressing date, for new-release detection.
 *
 * Separate from `getArtistReleasesFromMirror` because the browse payload has no
 * place for that date, and the notification event window needs it: a group that
 * gains a pressing years later is a new event, a pressing from the same window is
 * not. Both come from the same grouping query, so this is one aggregate more.
 */
export const getArtistReleaseGroupCandidatesFromMirror = (
    artistId: string,
): ReleaseGroupCandidate[] | null => {
    const db = getMusicDb();
    if (!db) return null;

    const rows = readArtistReleaseGroups(db, artistId, null, 0);
    if (rows.length === 0) {
        return readArtistRow(db, artistId) ? [] : null;
    }

    return rows.map((row) => ({
        id: row.mbid,
        title: row.title,
        date: nullIfEmpty(row.first_release_date),
        disambiguation: disambiguationValue(row.disambiguation),
        primaryType: row.primary_type ?? null,
        releaseIds: row.release_ids.split(' ').filter(Boolean),
        newestReleaseId: row.release_ids.split(' ').filter(Boolean)[0] ?? row.mbid,
        newestReleaseDate: nullIfEmpty(row.newest_release_date),
    }));
};

export const countArtistReleasesFromMirror = (artistId: string): number | null => {
    const db = getMusicDb();
    if (!db) return null;
    if (!readArtistRow(db, artistId)) return null;
    return countArtistReleaseGroups(db, artistId);
};

export const getArtistReleaseIdsFromMirror = (artistId: string): string[] | null => {
    const db = getMusicDb();
    if (!db) return null;
    if (!readArtistRow(db, artistId)) return null;
    return readArtistReleaseIds(db, artistId);
};

export const getArtistReleaseGroupIdsFromMirror = (artistId: string): string[] | null => {
    const db = getMusicDb();
    if (!db) return null;
    if (!readArtistRow(db, artistId)) return null;
    return readArtistReleaseGroupIds(db, artistId);
};

export const getArtistDetailsFromMirror = (artistId: string): Artist | null => {
    const db = getMusicDb();
    if (!db) return null;

    const row = readArtistRow(db, artistId);
    if (!row) return null;

    return buildArtist(
        row,
        readArtistAliases(db, artistId),
        readArtistRelationships(db, artistId),
        readExternalLinks(db, 'artist', artistId),
        linksFromRows,
    );
};

export const getFollowedArtistSummaryFromMirror = (
    artistId: string,
): FollowedArtistSummary | null => {
    const db = getMusicDb();
    if (!db) return null;

    const row = readArtistRow(db, artistId);
    if (!row) return null;

    const links = mapUrlsToExternalLinks(
        readExternalLinks(db, 'artist', artistId).map((link) => link.url),
    );

    return {
        id: row.mbid,
        name: row.name.trim().length > 0 ? row.name : row.mbid,
        refreshedAt: Date.now(),
        discogsUrls: getExternalLinkUrlsByService(links, 'discogs'),
    };
};

const mirrorSearchReady = (): boolean => isMusicDbEnabled() && musicDbHasSearchIndex();

export const searchArtistsFromMirror = (
    query: string,
    offset: number,
    limit: number,
): ArtistSearchResult | null => {
    if (!mirrorSearchReady()) return null;
    const db = getMusicDb();
    if (!db) return null;

    const matchQuery = toFtsQuery(query);
    if (matchQuery.length === 0) {
        return { artists: [], count: 0 };
    }

    const result = searchEntitiesWithBudget(db, 'artist', matchQuery, limit, offset);
    return {
        artists: result.rows.map((row) => ({ id: row.mbid, name: row.title })),
        count: result.count,
    };
};

export const searchReleaseGroupsFromMirror = (
    query: string,
    offset: number,
    limit: number,
): ReleaseGroupSearchResult | null => {
    if (!mirrorSearchReady()) return null;
    const db = getMusicDb();
    if (!db) return null;

    const matchQuery = toFtsQuery(query);
    if (matchQuery.length === 0) {
        return { releaseGroups: [], count: 0 };
    }

    const result = searchEntitiesWithBudget(db, 'release_group', matchQuery, limit, offset);
    return {
        releaseGroups: result.rows.map((row) => {
            const group = readReleaseGroupRow(db, row.mbid);
            return {
                id: row.mbid,
                title: group?.title ?? row.title,
                'primary-type': group?.primary_type ?? null,
                'first-release-date': group?.first_release_date ?? null,
                'artist-credit': readReleaseGroupArtists(db, row.mbid),
            };
        }),
        count: result.count,
    };
};

export const getReleaseGroupReleasesFromMirror = (
    releaseGroupId: string,
    onReleaseIdsPage?: (
        releaseGroupId: string,
        releaseIds: string[],
        isLastPage: boolean,
    ) => Promise<void> | void,
): { id: string; title: string }[] | null => {
    const db = getMusicDb();
    if (!db) return null;

    const rows = readReleaseGroupReleases(db, releaseGroupId);
    if (rows.length === 0) {
        return readReleaseGroupExists(db, releaseGroupId) ? [] : null;
    }

    return rows.map((row) => ({
        id: row.mbid,
        title: nameWithDisambiguation(row.disambiguation, row.title),
    }));
};

/**
 * Release-group release IDs, for cover planning.
 *
 * The release-group screen already needs these ids; the API path passed them down
 * via a paginated callback, so this returns the same shape.
 */
export const getReleaseGroupReleaseIdsFromMirror = (releaseGroupId: string): string[] | null => {
    const db = getMusicDb();
    if (!db) return null;
    const rows = readReleaseGroupReleases(db, releaseGroupId);
    if (rows.length === 0 && !readReleaseGroupExists(db, releaseGroupId)) return null;
    return rows.map((row) => row.mbid);
};

/**
 * Release id -> release-group id, for migrating known-release state.
 *
 * Returns null when the mirror is unavailable so the caller can keep the ids as
 * they are instead of silently dropping a user's history.
 */
export const getReleaseToGroupIdMapFromMirror = (
    releaseIds: readonly string[],
): Map<string, string> | null => {
    const db = getMusicDb();
    if (!db) return null;
    return readReleaseToGroupIds(db, releaseIds);
};

/** Artist credits for release groups, keyed by group id. */
export const getReleaseGroupCreditsFromMirror = (
    releaseGroupIds: readonly string[],
): Map<string, ArtistCredit[]> => {
    const result = new Map<string, ArtistCredit[]>();
    const db = getMusicDb();
    if (!db) return result;

    for (const groupId of releaseGroupIds) {
        result.set(groupId, readReleaseGroupArtists(db, groupId));
    }
    return result;
};

/**
 * Deezer/Tidal album links per release, for the artwork provider chain.
 *
 * Returns an empty map when the mirror is unavailable: artwork still resolves
 * through Cover Art Archive, which needs no relation data.
 */
export const getProviderUrlsForReleasesFromMirror = (
    releaseIds: readonly string[],
): Map<string, { deezerUrls: string[]; tidalUrls: string[] }> => {
    const db = getMusicDb();
    if (!db) return new Map();
    return readProviderUrlsForReleases(db, releaseIds);
};

/** Release ids of a group, used to derive the group's provider links. */
export const getReleaseIdsForGroupFromMirror = (releaseGroupId: string): string[] => {
    const db = getMusicDb();
    if (!db) return [];
    return readReleaseIdsForGroup(db, releaseGroupId);
};

/**
 * Artist name plus provider links, for the profile-image chain.
 *
 * The image worker used to fetch `/artist/{id}?inc=url-rels` from the MusicBrainz
 * API for every artist without a cached image; the mirror has the same relations
 * locally, so that round trip (and its 1 req/s budget) disappears.
 */
export type ArtistImageProviderLinks = {
    artistName: string | undefined;
    deezerUrls: string[];
    tidalUrls: string[];
    discogsUrls: string[];
};

export const getArtistImageProviderLinksFromMirror = (
    artistId: string,
): ArtistImageProviderLinks | null => {
    const db = getMusicDb();
    if (!db) return null;

    const row = readArtistRow(db, artistId);
    if (!row) return null;

    const links = readExternalLinks(db, 'artist', artistId);
    const deezerUrls: string[] = [];
    const tidalUrls: string[] = [];
    const discogsUrls: string[] = [];

    for (const link of links) {
        const url = link.url.trim();
        if (!url) continue;
        if (url.includes('deezer.com/')) deezerUrls.push(url);
        else if (url.includes('tidal.com/')) tidalUrls.push(url);
        else if (url.includes('discogs.com/')) discogsUrls.push(url);
    }

    return {
        artistName: row.name.trim().length > 0 ? row.name : undefined,
        deezerUrls,
        tidalUrls,
        discogsUrls,
    };
};

export const releaseExistsInMirror = (releaseId: string): boolean | null => {
    const db = getMusicDb();
    if (!db) return null;
    return readReleaseExists(db, releaseId);
};

/**
 * Release metadata from the mirror.
 *
 * Tracks are deliberately not stored in the mirror, so this returns everything
 * except `media`; the caller attaches the tracklist from the API. `null` means the
 * mirror does not know the release, not that it does not exist.
 */
export const getReleaseMetadataFromMirror = (
    releaseId: string,
): Omit<Release, 'media' | 'cover_url'> | null => {
    const db = getMusicDb();
    if (!db) return null;

    const row = readReleaseRow(db, releaseId);
    if (!row) return null;

    const group = row.release_group_mbid
        ? readReleaseGroupRow(db, row.release_group_mbid)
        : undefined;
    const credits: ArtistCredit[] = readReleaseArtists(db, releaseId);
    const releaseGroup: ReleaseGroup | null = group ? buildReleaseGroup(group) : null;
    const links = readExternalLinks(db, 'release', releaseId);

    return {
        id: row.mbid,
        title: row.title,
        artistId: credits[0]?.id ?? '',
        date: nullIfEmpty(row.date),
        date_for_display: formatDate(nullIfEmpty(row.date)),
        disambiguation: disambiguationValue(row.disambiguation),
        releaseGroupId: row.release_group_mbid ?? null,
        'release-group': releaseGroup,
        'artist-credit': credits,
        externalLinks: linksFromRows(links),
    };
};
