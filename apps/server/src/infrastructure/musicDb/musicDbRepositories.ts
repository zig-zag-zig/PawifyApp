import type {
    Artist,
    ArtistCredit,
    Release,
    ReleaseGroup,
    ReleaseGroupReleaseListItem,
} from '@pawify/shared';

import type { CachedArtistReleases } from '../../utils/types/cacheTypes.js';
import type {
    ReleaseGroupCandidate,
    ReleaseEditionCandidate,
} from '../../features/releases/domain/releaseGroupProcessing.js';
import {
    extractEditionKeywords,
    isOfficialReleaseStatus,
} from '../../features/releases/domain/releaseEditionKeywords.js';
import type {
    ArtistSearchResult,
    RecordingSearchResult,
    ReleaseGroupSearchResult,
} from '../../features/artists/domain/searchResults.js';
import type { FollowedArtistSummary } from '../../utils/types/followedArtistTypes.js';
import {
    dedupeExternalLinks,
    getExternalLinkUrlsByService,
    mapUrlsToExternalLinks,
} from '../../utils/helpers/externalLinks.js';
import { formatDate, nameWithDisambiguation } from '@pawify/shared';
import { getMusicDb } from './musicDbClient.js';
import { readRecordingSearch } from './recordingQueries.js';
import { musicDbConfig } from '../../config/runtimeConfig.js';
import { createLogger } from '../../common/logging/logger.js';
import { dateToTimestamp } from '../../utils/dateUtil.js';

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
    readArtistNotificationCatalogRows,
    countArtistNotificationReleasesUpTo,
    type ArtistNotificationCatalogRow,
    readArtistReleaseGroupIds,
    readArtistReleaseIds,
    readArtistRow,
    readExternalLinks,
    readReleaseArtists,
    readReleaseMedia,
    readReleaseTracks,
    readTrackArtistsForRelease,
    readRecordingArtistsForRecordings,
    readRecordingLyricsForRecordings,
    readProviderUrlsForReleases,
    readReleaseExists,
    readReleaseGroupArtists,
    readReleaseGroupExists,
    readReleaseGroupReleases,
    readReleaseGroupRow,
    readReleaseIdsForGroup,
    readReleaseToGroupIds,
    readReleaseRow,
    RELEASE_GROUP_FORMAT_SEPARATOR,
    type ReleaseGroupReleaseRow,
    searchEntitiesWithBudget,
    toFtsHeadingPhrase,
    toFtsQuery,
    type ExternalLinkRow,
} from './musicDbQueries.js';

/**
 * Builds external links from mirror rows.
 *
 * The same URL appears once per relation type in the mirror (a store page is both
 * "purchase for download" and "streaming"). Mapping each row and then running the
 * shared dedupe returns one link per URL.
 */
const linksFromRows = (rows: ExternalLinkRow[]) =>
    dedupeExternalLinks(rows.flatMap((row) => mapUrlsToExternalLinks([row.url], row.rel_type)));

/**
 * Turns the release-group list query rows into the shared list shape.
 *
 * The query aggregates media per release, so no tracklist is loaded. A missing
 * track count stays null and empty formats are dropped, which keeps the client from
 * showing "0 tracks" for a release the mirror knows nothing about yet.
 */
export const buildReleaseGroupReleaseListItems = (
    rows: readonly ReleaseGroupReleaseRow[],
): ReleaseGroupReleaseListItem[] =>
    rows.map((row) => ({
        id: row.mbid,
        title: nameWithDisambiguation(row.disambiguation, row.title),
        date: row.date,
        trackCount: row.track_count,
        formats: (row.formats ?? '')
            .split(RELEASE_GROUP_FORMAT_SEPARATOR)
            .map((format) => format.trim())
            .filter((format, index, all) => format.length > 0 && all.indexOf(format) === index),
        country: nullIfEmpty(row.country),
        status: nullIfEmpty(row.status),
    }));

/**
 * Folds one row-per-release-medium result into notification candidates.
 *
 * Release IDs, newest pressing, Official edition snapshots and their media
 * aggregates all come from the same scan, so detection does not repeat the
 * release query or materialize a second full result.
 */
export const buildArtistReleaseGroupCandidates = (
    rows: readonly ArtistNotificationCatalogRow[],
): ReleaseGroupCandidate[] => {
    type GroupAccumulator = {
        group: ReleaseGroupCandidate;
        editions: Map<string, ReleaseEditionCandidate>;
        releaseDates: Map<string, string | null>;
    };

    const byGroup = new Map<string, GroupAccumulator>();

    for (const row of rows) {
        if (row.group_mbid === null || row.group_title === null) {
            continue;
        }

        let accumulator = byGroup.get(row.group_mbid);
        if (!accumulator) {
            accumulator = {
                group: {
                    id: row.group_mbid,
                    title: row.group_title,
                    date: nullIfEmpty(row.group_first_release_date),
                    disambiguation: disambiguationValue(row.group_disambiguation),
                    primaryType: row.group_primary_type,
                    releaseIds: [],
                    newestReleaseId: row.release_mbid,
                    newestReleaseDate: nullIfEmpty(row.release_date),
                    officialEditions: [],
                },
                editions: new Map(),
                releaseDates: new Map(),
            };
            byGroup.set(row.group_mbid, accumulator);
        }

        const group = accumulator.group;
        if (!accumulator.releaseDates.has(row.release_mbid)) {
            accumulator.releaseDates.set(row.release_mbid, nullIfEmpty(row.release_date));
        }

        const releaseTime = dateToTimestamp(nullIfEmpty(row.release_date));
        const newestTime = dateToTimestamp(group.newestReleaseDate);
        if (
            releaseTime > newestTime ||
            (releaseTime === newestTime && row.release_mbid < group.newestReleaseId)
        ) {
            group.newestReleaseId = row.release_mbid;
            group.newestReleaseDate = nullIfEmpty(row.release_date);
        }

        let edition = accumulator.editions.get(row.release_mbid);
        if (!edition) {
            edition = {
                releaseId: row.release_mbid,
                date: nullIfEmpty(row.release_date),
                status: nullIfEmpty(row.release_status),
                trackCount: null,
                formats: [],
                title: row.release_title,
                disambiguation: nullIfEmpty(row.release_disambiguation),
                editionKeywords: extractEditionKeywords(
                    row.release_title,
                    row.release_disambiguation,
                ),
            };
            accumulator.editions.set(row.release_mbid, edition);
        }

        if (typeof row.media_track_count === 'number') {
            edition.trackCount = (edition.trackCount ?? 0) + row.media_track_count;
        }

        const format = row.media_format?.trim();
        if (format && !edition.formats.includes(format)) {
            edition.formats.push(format);
        }
    }

    return Array.from(byGroup.values())
        .map(({ group, editions, releaseDates }) => {
            const orderedReleaseIds = Array.from(releaseDates.keys()).sort((left, right) => {
                const dateOrder =
                    dateToTimestamp(releaseDates.get(right) ?? null) -
                    dateToTimestamp(releaseDates.get(left) ?? null);
                return dateOrder !== 0 ? dateOrder : left.localeCompare(right);
            });

            return {
                ...group,
                releaseIds: orderedReleaseIds,
                officialEditions: Array.from(editions.values()).filter((edition) =>
                    isOfficialReleaseStatus(edition.status),
                ),
            };
        })
        .sort((left, right) => {
            const dateOrder = dateToTimestamp(right.date) - dateToTimestamp(left.date);
            return dateOrder !== 0 ? dateOrder : left.id.localeCompare(right.id);
        });
};

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
 * Artist release groups with content metadata, for new-release detection.
 *
 * Reads the single notification catalogue scan, never the browse query or its
 * pagination cap. `complete: false` means the caller must preserve state and emit
 * nothing: the result is capped/unresolved. `null` means the artist is absent from
 * the local snapshot (not proof of global deletion).
 */
export type ArtistNotificationCatalog = {
    groups: ReleaseGroupCandidate[];
    complete: boolean;
};

export const getArtistReleaseGroupCandidatesFromMirror = (
    artistId: string,
): ArtistNotificationCatalog | null => {
    const db = getMusicDb();

    const limit = musicDbConfig.maxArtistNotificationReleases;
    const releaseCount = countArtistNotificationReleasesUpTo(db, artistId, limit);
    if (releaseCount === null) {
        return null;
    }
    if (limit > 0 && releaseCount > limit) {
        logger.warn('artist notification catalogue exceeds safety bound', {
            artistId,
            releaseCount: limit + 1,
            limit,
        });
        return { groups: [], complete: false };
    }

    const rows = readArtistNotificationCatalogRows(db, artistId, limit);
    return buildArtistNotificationCatalogFromRows(rows, limit);
};

/**
 * Turns loaded notification rows into the authoritative catalogue result.
 *
 * Kept pure so the loader's independent overflow signal can be tested after a
 * writer commits past the bound but before the load runs.
 */
export const buildArtistNotificationCatalogFromRows = (
    rows: readonly ArtistNotificationCatalogRow[],
    limit: number,
): ArtistNotificationCatalog => {
    if (rows.length === 0) {
        return { groups: [], complete: true };
    }

    // The loader selects limit + 1 distinct releases. If a concurrent sync added
    // releases after the probe passed, this catches the overflow independently
    // instead of mistaking a capped newer snapshot for a complete one.
    const loadedReleaseCount = rows[0]?.artist_release_count ?? 0;
    if (limit > 0 && loadedReleaseCount > limit) {
        return { groups: [], complete: false };
    }

    // A release whose parent group row is missing is not safe to treat as a
    // complete catalogue: detection would prune that group from known state.
    const hasUnresolvedGroup = rows.some((row) => row.group_mbid === null);

    return {
        groups: buildArtistReleaseGroupCandidates(rows),
        complete: !hasUnresolvedGroup,
    };
};

export const countArtistReleasesFromMirror = (artistId: string): number | null => {
    const db = getMusicDb();
    if (!readArtistRow(db, artistId)) return null;
    return countArtistReleaseGroups(db, artistId);
};

export const getArtistReleaseIdsFromMirror = (artistId: string): string[] | null => {
    const db = getMusicDb();
    if (!readArtistRow(db, artistId)) return null;
    return readArtistReleaseIds(db, artistId);
};

export const getArtistReleaseGroupIdsFromMirror = (artistId: string): string[] | null => {
    const db = getMusicDb();
    if (!readArtistRow(db, artistId)) return null;
    return readArtistReleaseGroupIds(db, artistId);
};

export const getArtistDetailsFromMirror = (artistId: string): Artist | null => {
    const db = getMusicDb();

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

export const searchArtistsFromMirror = (
    query: string,
    offset: number,
    limit: number,
): ArtistSearchResult => {
    const db = getMusicDb();

    const matchQuery = toFtsQuery(query);
    if (matchQuery.length === 0) {
        return { artists: [], count: 0 };
    }

    const result = searchEntitiesWithBudget(
        db,
        'artist',
        matchQuery,
        limit,
        offset,
        toFtsHeadingPhrase(query),
        query,
    );
    return {
        artists: result.rows.map((row) => ({ id: row.mbid, name: row.title })),
        count: result.count,
    };
};

export const searchReleaseGroupsFromMirror = (
    query: string,
    offset: number,
    limit: number,
): ReleaseGroupSearchResult => {
    const db = getMusicDb();

    const matchQuery = toFtsQuery(query);
    if (matchQuery.length === 0) {
        return { releaseGroups: [], count: 0 };
    }

    const result = searchEntitiesWithBudget(
        db,
        'release_group',
        matchQuery,
        limit,
        offset,
        toFtsHeadingPhrase(query),
        query,
    );
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
): ReleaseGroupReleaseListItem[] | null => {
    const db = getMusicDb();

    const rows = readReleaseGroupReleases(db, releaseGroupId);
    if (rows.length === 0) {
        return readReleaseGroupExists(db, releaseGroupId) ? [] : null;
    }

    return buildReleaseGroupReleaseListItems(rows);
};

/**
 * Release-group release IDs, for cover planning.
 *
 * Kept for cover planning and focused callers that only need ids.
 */
export const getReleaseGroupReleaseIdsFromMirror = (releaseGroupId: string): string[] | null => {
    const db = getMusicDb();
    const rows = readReleaseGroupReleases(db, releaseGroupId);
    if (rows.length === 0 && !readReleaseGroupExists(db, releaseGroupId)) return null;
    return Array.from(new Set(rows.map((row) => row.mbid)));
};

/**
 * Release id -> release-group id, for migrating known-release state.
 *
 * A mirror failure throws so the caller can keep the ids as they are instead of
 * silently dropping a user's history.
 */
export const getReleaseToGroupIdMapFromMirror = (
    releaseIds: readonly string[],
): Map<string, string> => {
    const db = getMusicDb();
    return readReleaseToGroupIds(db, releaseIds);
};

/** Artist credits for release groups, keyed by group id. */
export const getReleaseGroupCreditsFromMirror = (
    releaseGroupIds: readonly string[],
): Map<string, ArtistCredit[]> => {
    const result = new Map<string, ArtistCredit[]>();
    const db = getMusicDb();

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
    return readProviderUrlsForReleases(db, releaseIds);
};

/** Release ids of a group, used to derive the group's provider links. */
export const getReleaseIdsForGroupFromMirror = (releaseGroupId: string): string[] => {
    const db = getMusicDb();
    return readReleaseIdsForGroup(db, releaseGroupId);
};

/**
 * Artist name plus provider links, for the profile-image chain.
 *
 * The image worker reads these relations locally; it never requests MusicBrainz
 * Web Service metadata for an artist.
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

/**
 * Whether the mirror has the release at all.
 *
 * Distinguishes "this release has no Deezer/Tidal links" from "this release is not
 * in the local snapshot". A miss is local only; it is not a remote probe and not an
 * authoritative global deletion.
 */
export const releaseExistsInMirror = (releaseId: string): boolean => {
    const db = getMusicDb();
    return readReleaseExists(db, releaseId);
};

/** Release-group counterpart of `releaseExistsInMirror`. */
export const releaseGroupExistsInMirror = (releaseGroupId: string): boolean => {
    const db = getMusicDb();
    return readReleaseGroupExists(db, releaseGroupId);
};

export const searchRecordingsFromMirror = (
    query: string,
    offset: number,
    limit: number,
): RecordingSearchResult => {
    const db = getMusicDb();
    return readRecordingSearch(db, query, offset, limit);
};

const buildReleaseMedia = (
    db: ReturnType<typeof getMusicDb>,
    releaseId: string,
): Release['media'] => {
    const media = readReleaseMedia(db, releaseId);
    const tracks = readReleaseTracks(db, releaseId);
    const trackCredits = readTrackArtistsForRelease(db, releaseId);
    const recordingIds = Array.from(
        new Set(
            tracks
                .map((track) => track.recording_mbid)
                .filter((id): id is string => typeof id === 'string' && id.length > 0),
        ),
    );
    // Compacted mirrors omit track credits identical to the recording credit.
    const recordingCredits = readRecordingArtistsForRecordings(db, recordingIds);
    const recordingLyrics = readRecordingLyricsForRecordings(db, recordingIds);

    return media.map((medium) => ({
        'track-count': medium.track_count,
        format: medium.format,
        position: medium.position,
        tracks: tracks
            .filter((track) => track.medium_position === medium.position)
            .map((track) => {
                // The public track id is release-scoped, never a recording MBID:
                // the same recording may appear twice on one release.
                const credits =
                    (trackCredits.get(track.track_id)?.length ?? 0) > 0
                        ? trackCredits.get(track.track_id)!
                        : ((track.recording_mbid
                              ? recordingCredits.get(track.recording_mbid)
                              : undefined) ?? []);

                return {
                    id: track.mbid,
                    recordingId: track.recording_mbid ?? null,
                    title: track.title,
                    'artist-credit': credits,
                    length: track.length,
                    lyricsUrl: track.recording_mbid
                        ? (recordingLyrics.get(track.recording_mbid) ?? null)
                        : null,
                    number: track.number,
                };
            }),
    }));
};

/** Media/tracks only; used by the unified release read and focused tests. */
export const getReleaseMediaFromMirror = (releaseId: string): Release['media'] | null => {
    const db = getMusicDb();
    if (!readReleaseExists(db, releaseId)) return null;
    return buildReleaseMedia(db, releaseId);
};

/**
 * Complete release snapshot: metadata, media, ordered tracks, credits and current
 * recording identities from one SQLite read transaction.
 *
 * A read transaction is what makes "one request" mean one committed mirror
 * version; separate statements could straddle an hourly sync commit.
 */
export const getReleaseFromMirror = (releaseId: string): Release | null => {
    const db = getMusicDb();
    return db.transaction((): Release | null => {
        const row = readReleaseRow(db, releaseId);
        if (!row) return null;

        const group = row.release_group_mbid
            ? readReleaseGroupRow(db, row.release_group_mbid)
            : undefined;
        const credits = readReleaseArtists(db, releaseId);

        return {
            id: row.mbid,
            title: row.title,
            artistId: credits[0]?.id ?? '',
            date: nullIfEmpty(row.date),
            date_for_display: formatDate(nullIfEmpty(row.date)),
            disambiguation: disambiguationValue(row.disambiguation),
            releaseGroupId: row.release_group_mbid ?? null,
            'release-group': group ? buildReleaseGroup(group) : null,
            'artist-credit': credits,
            media: buildReleaseMedia(db, releaseId),
            barcode: row.barcode,
            status: row.status,
            country: nullIfEmpty(row.country),
            cover_url: null,
            externalLinks: linksFromRows(readExternalLinks(db, 'release', releaseId)),
        };
    })();
};

/**
 * Release-group identity plus its complete local edition list from one snapshot.
 *
 * No tracks are loaded: the list only needs media aggregates, and the individual
 * release screen reads its own tracklist when opened.
 */
export type ReleaseGroupFromMirror = {
    releaseGroup: ReleaseGroup;
    releases: ReleaseGroupReleaseListItem[];
    releaseCount: number;
};

export const getReleaseGroupFromMirror = (
    releaseGroupId: string,
): ReleaseGroupFromMirror | null => {
    const db = getMusicDb();
    return db.transaction((): ReleaseGroupFromMirror | null => {
        const groupRow = readReleaseGroupRow(db, releaseGroupId);
        if (!groupRow) return null;

        const rows = readReleaseGroupReleases(db, releaseGroupId);
        return {
            releaseGroup: buildReleaseGroup(groupRow),
            releases: buildReleaseGroupReleaseListItems(rows),
            releaseCount: rows.length,
        };
    })();
};
