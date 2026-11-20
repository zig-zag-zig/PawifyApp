import { createLogger } from '../../common/logging/logger.js';
import { mapWithConcurrency } from '../../utils/helpers/promisePool.js';
import type {
    ArtistProfileImageLookup,
    ReleaseGroupPageEntry,
    ReleaseGroupReleasesPageEntry,
    TrackLyricsRequest,
} from '../../utils/types/taskTypes.js';
import {
    readEntityImages,
    type EntityImageEntityType,
    type EntityImageRecord,
} from '../../infrastructure/musicDb/entityImageRepository.js';
import {
    resolveEntityImageFreshness,
    scheduleEntityImageRevalidation,
} from '../musicApi/entityImageFreshness.js';
import { resolveArtistImage } from '../musicApi/artistImageSources.js';
import { fetchReleaseCover, fetchReleaseGroupCover } from '../coverArt/coverArtLookup.js';
import { getArtistImageProviderLinksFromMirror } from '../../infrastructure/musicDb/musicDbRepositories.js';
import {
    buildDurableLyricsLookupIdentity,
    isUsableLyricsState,
    readLyricsStates,
} from '../../infrastructure/lyricsDb/lyricsStateRepository.js';

const logger = createLogger('services.cache.partitionAssets');

const PRE_RESOLVE_CONCURRENCY = 8;

export type CachedAssetPartition<TPending> = {
    /** Items already resolvable from persisted state: URL strings or confirmed nulls. */
    resolved: Record<string, string | null>;
    /** Items that still need background work. */
    pending: TPending[];
};

const logPreResolved = (
    assetType: string,
    totalCount: number,
    resolvedCount: number,
    startedAt: number,
): void => {
    if (totalCount === 0) {
        return;
    }

    logger.info('background asset pre-resolution completed', {
        assetType,
        itemCount: totalCount,
        resolvedCount,
        pendingCount: totalCount - resolvedCount,
        durationMs: Date.now() - startedAt,
    });
};

/**
 * Applies the freshness matrix to one mirrored row.
 *
 * A row that is due for a re-check is still returned immediately; the re-check is
 * detached background work, so a page never waits on it. `null` means no usable row
 * and the caller queues provider work.
 */
const mirrorValue = (
    record: EntityImageRecord | undefined,
    entityType: EntityImageEntityType,
    entityId: string,
    resolve: () => Promise<string | null | undefined>,
): { value: string | null } | null => {
    if (!record) {
        return null;
    }

    const freshness = resolveEntityImageFreshness(entityType, record);
    if (!freshness) {
        return null;
    }

    if (freshness.revalidate) {
        scheduleEntityImageRevalidation(entityType, entityId, resolve, {
            settlePermanent: freshness.settlePermanent,
        });
    }

    return { value: record.service === 'none' ? null : record.url };
};

export const partitionArtistProfileImages = async (
    lookups: ArtistProfileImageLookup[],
): Promise<CachedAssetPartition<ArtistProfileImageLookup>> => {
    const startedAt = Date.now();
    const resolved: Record<string, string | null> = {};
    const pending: ArtistProfileImageLookup[] = [];

    const artistIds = lookups
        .map((lookup) => lookup.artistId)
        .filter(
            (artistId): artistId is string => typeof artistId === 'string' && artistId.length > 0,
        );
    const mirror = readEntityImages('artist', artistIds);

    await mapWithConcurrency(lookups, PRE_RESOLVE_CONCURRENCY, async (lookup) => {
        if (!lookup.artistId) {
            pending.push(lookup);
            return;
        }

        const artistId = lookup.artistId;
        const mirrored = mirrorValue(mirror.get(artistId), 'artist', artistId, async () => {
            const links = getArtistImageProviderLinksFromMirror(artistId);
            const refreshed = await resolveArtistImage({
                artistId,
                artistName: lookup.artistName ?? links?.artistName,
                deezerUrls: lookup.deezerUrls ?? links?.deezerUrls,
                tidalUrls: lookup.tidalUrls ?? links?.tidalUrls,
                discogsUrls: lookup.discogsUrls ?? links?.discogsUrls,
                bypassMirror: true,
            });
            return refreshed.image;
        });

        if (mirrored) {
            resolved[artistId] = mirrored.value;
            return;
        }
        pending.push(lookup);
    });

    logPreResolved(
        'artist_profile_images',
        lookups.length,
        Object.keys(resolved).length,
        startedAt,
    );
    return { resolved, pending };
};

/**
 * Splits track lyrics requests into persisted and pending sets.
 *
 * Lyrics state lives in the application-owned SQLite store keyed by durable
 * recording identity/query variant, not in Redis under a release-scoped key. The
 * request still returns release-scoped track ids, so a recording reused on two
 * releases can resolve from one persisted lookup without duplicating results.
 */
export const partitionTrackLyrics = async (
    _releaseId: string,
    tracks: TrackLyricsRequest[],
    now: number = Date.now(),
): Promise<CachedAssetPartition<TrackLyricsRequest>> => {
    const startedAt = Date.now();
    const resolved: Record<string, string | null> = {};
    const pending: TrackLyricsRequest[] = [];

    const states = readLyricsStates(tracks);
    for (const track of tracks) {
        const state = states.get(buildDurableLyricsLookupIdentity(track).lookupKey);

        // Resolved lyrics are permanent: serve the URL and never queue work again.
        if (state?.lyricsUrl) {
            resolved[track.trackId] = state.lyricsUrl;
            continue;
        }
        // A confirmed absence is served as null until its retry gate opens.
        if (isUsableLyricsState(state, now)) {
            resolved[track.trackId] = null;
            continue;
        }

        pending.push(track);
    }

    logPreResolved('release_tracks_lyrics', tracks.length, Object.keys(resolved).length, startedAt);
    return { resolved, pending };
};

/**
 * Splits release-group release cover page entries into mirrored and pending sets.
 *
 * A release without its own artwork inherits the group cover, exactly like the
 * live provider chain.
 */
export const partitionReleaseGroupReleaseCovers = async (
    pageEntries: ReleaseGroupReleasesPageEntry[],
): Promise<CachedAssetPartition<ReleaseGroupReleasesPageEntry>> => {
    const startedAt = Date.now();
    const resolved: Record<string, string | null> = {};
    const pending: ReleaseGroupReleasesPageEntry[] = [];
    const allReleaseIds = pageEntries.flatMap((entry) => entry.releaseIds);

    const mirror = readEntityImages('release', allReleaseIds);
    const groupIds = pageEntries
        .map((entry) => entry.releaseGroupId)
        .filter((groupId): groupId is string => typeof groupId === 'string' && groupId.length > 0);
    const groupMirror = readEntityImages('release_group', groupIds);

    for (const entry of pageEntries) {
        const unresolvedReleaseIds: string[] = [];
        const groupRecord = entry.releaseGroupId
            ? groupMirror.get(entry.releaseGroupId)
            : undefined;
        const groupFallback =
            groupRecord && groupRecord.service !== 'none' && groupRecord.service !== 'pending'
                ? groupRecord.url
                : null;
        const groupUnresolved =
            Boolean(entry.releaseGroupId) && (!groupRecord || groupRecord.service === 'pending');

        for (const releaseId of entry.releaseIds) {
            const mirrored = mirrorValue(mirror.get(releaseId), 'release', releaseId, () =>
                fetchReleaseCover(releaseId, null, undefined, undefined, {
                    bypassMirror: true,
                }),
            );
            if (mirrored) {
                if (mirrored.value !== null) {
                    resolved[releaseId] = mirrored.value;
                    continue;
                }
                if (groupFallback !== null) {
                    resolved[releaseId] = groupFallback;
                    continue;
                }
                if (!groupUnresolved) {
                    resolved[releaseId] = null;
                    continue;
                }
            }
            unresolvedReleaseIds.push(releaseId);
        }

        if (unresolvedReleaseIds.length > 0) {
            pending.push({
                releaseGroupId: entry.releaseGroupId,
                releaseIds: unresolvedReleaseIds,
            });
        }
    }

    logPreResolved(
        'release_group_release_covers',
        allReleaseIds.length,
        Object.keys(resolved).length,
        startedAt,
    );
    return { resolved, pending };
};

/** Splits artist release-group cover entries into mirrored and pending sets. */
export const partitionArtistReleaseGroupCovers = async (
    _artistId: string,
    pageEntries: ReleaseGroupPageEntry[],
): Promise<CachedAssetPartition<ReleaseGroupPageEntry>> => {
    const startedAt = Date.now();
    const resolved: Record<string, string | null> = {};
    const pending: ReleaseGroupPageEntry[] = [];

    const groupIds = pageEntries.map((entry) => entry.releaseGroupId);
    const mirror = readEntityImages('release_group', groupIds);

    for (const entry of pageEntries) {
        const mirrored = mirrorValue(
            mirror.get(entry.releaseGroupId),
            'release_group',
            entry.releaseGroupId,
            () =>
                fetchReleaseGroupCover(entry.releaseGroupId, undefined, undefined, undefined, {
                    bypassMirror: true,
                }),
        );
        if (mirrored) {
            resolved[entry.releaseGroupId] = mirrored.value;
            continue;
        }
        pending.push(entry);
    }

    logPreResolved(
        'release_group_covers',
        pageEntries.length,
        Object.keys(resolved).length,
        startedAt,
    );
    return { resolved, pending };
};

export interface AssetCachePartitioner {
    partitionArtistProfileImages(
        lookups: ArtistProfileImageLookup[],
    ): Promise<CachedAssetPartition<ArtistProfileImageLookup>>;
    partitionTrackLyrics(
        releaseId: string,
        tracks: TrackLyricsRequest[],
    ): Promise<CachedAssetPartition<TrackLyricsRequest>>;
    partitionReleaseGroupReleaseCovers(
        pageEntries: ReleaseGroupReleasesPageEntry[],
    ): Promise<CachedAssetPartition<ReleaseGroupReleasesPageEntry>>;
    partitionArtistReleaseGroupCovers(
        artistId: string,
        pageEntries: ReleaseGroupPageEntry[],
    ): Promise<CachedAssetPartition<ReleaseGroupPageEntry>>;
}

export const cacheAssetPartitioner: AssetCachePartitioner = {
    partitionArtistProfileImages,
    partitionTrackLyrics,
    partitionReleaseGroupReleaseCovers,
    partitionArtistReleaseGroupCovers,
};
