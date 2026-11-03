import type { ArtistCredit, Release } from '@pawify/shared';

import { createLogger } from '../../common/logging/logger.js';
import { cacheConfig } from '../../config/runtimeConfig.js';
import { getCachedData, replaceCachedData } from '../cacheService.js';
import { getCacheKey } from '../../utils/helpers/cacheHelpers.js';
import { getArtistReleasesFromMirror } from '../../infrastructure/musicDb/musicDbRepositories.js';
import { isMusicDbEnabled } from '../../infrastructure/musicDb/musicDbClient.js';
import type { ReleaseGroupCandidate } from '../../features/releases/domain/releaseGroupProcessing.js';
import { fetchAllReleasesForArtist } from './releaseQueries.js';
import { dateToTimestamp } from '../../utils/dateUtil.js';

const logger = createLogger('services.musicbrainz.artistReleaseGroupCatalog');

export type ArtistReleaseGroupCatalog = {
    groups: ReleaseGroupCandidate[];
    /** Artist credits per group, for building the feed entry without another lookup. */
    creditsByGroupId: Map<string, ArtistCredit[]>;
};

type CachedCatalog = {
    groups: ReleaseGroupCandidate[];
    credits: { [groupId: string]: ArtistCredit[] };
};

const toCached = (catalog: ArtistReleaseGroupCatalog): CachedCatalog => ({
    groups: catalog.groups,
    credits: Object.fromEntries(catalog.creditsByGroupId),
});

const fromCached = (cached: CachedCatalog): ArtistReleaseGroupCatalog => ({
    groups: cached.groups,
    creditsByGroupId: new Map(Object.entries(cached.credits)),
});

/**
 * Collapses an artist's releases into release groups.
 *
 * This is the API-mode equivalent of the mirror's grouping query: pick the newest
 * release of each group as the representative, and keep every release id because a
 * user can open any pressing from the group screen.
 */
const groupReleases = (releases: Release[]): ArtistReleaseGroupCatalog => {
    const groups = new Map<string, ReleaseGroupCandidate>();
    const newestDateByGroup = new Map<string, string | null>();
    const creditsByGroupId = new Map<string, ArtistCredit[]>();

    for (const release of releases) {
        const groupId = release.releaseGroupId;
        if (!groupId) {
            continue;
        }

        const existing = groups.get(groupId);
        if (existing) {
            existing.releaseIds.push(release.id);
            if (
                dateToTimestamp(release.date) >
                dateToTimestamp(newestDateByGroup.get(groupId) ?? null)
            ) {
                existing.newestReleaseId = release.id;
                newestDateByGroup.set(groupId, release.date);
            }
            continue;
        }

        groups.set(groupId, {
            id: groupId,
            title: release['release-group']?.title ?? release.title,
            date: release['release-group']?.date ?? release.date,
            disambiguation: release['release-group']?.disambiguation ?? release.disambiguation,
            primaryType: release['release-group']?.['primary-type'] ?? null,
            releaseIds: [release.id],
            newestReleaseId: release.id,
        });
        newestDateByGroup.set(groupId, release.date);
        creditsByGroupId.set(groupId, release['artist-credit'] ?? []);
    }

    return { groups: Array.from(groups.values()), creditsByGroupId };
};

const buildFromMirror = (artistId: string): ArtistReleaseGroupCatalog | null => {
    const groups = getArtistReleasesFromMirror(artistId);
    if (groups === null) {
        return null;
    }

    return {
        groups: groups.map((group) => ({
            id: group.id,
            title: group.title,
            date: group.date,
            disambiguation: group.disambiguation,
            primaryType: group['primary-type'],
            releaseIds: group.releaseIds,
            // The mirror orders a group's release ids newest first.
            newestReleaseId: group.releaseIds[0] ?? group.id,
        })),
        // The mirror stores group credits; the caller only needs them for groups
        // that turn out to be new, so this stays empty and is filled on demand.
        creditsByGroupId: new Map(),
    };
};

const fetchFromApi = async (artistId: string): Promise<ArtistReleaseGroupCatalog> => {
    // No `inc=recordings` any more: the diff compares release groups, so tracklists
    // were only ever fetched to detect duplicate releases within a group, which the
    // grouping now does for free.
    const releases = await fetchAllReleasesForArtist(artistId, false);
    return groupReleases(releases);
};

/**
 * Global, per-artist release-group catalog used by the new-release scan.
 *
 * The notification runner scans every followed artist for every user, so without
 * this cache the cost would be O(users x artists). The catalog for an artist is
 * user-independent; only the diff against each user's known set is per user.
 */
export const getArtistReleaseGroupCatalog = async (
    artistId: string,
    ttl: number | undefined = cacheConfig.releaseScanTtlHours,
): Promise<ArtistReleaseGroupCatalog> => {
    const cacheKey = getCacheKey(artistId, 'artistReleaseGroupCatalog');

    try {
        const cached = await getCachedData<CachedCatalog>(cacheKey);
        if (cached) {
            logger.debug('artist release-group catalog cache hit', {
                artistId,
                groupCount: cached.groups.length,
            });
            return fromCached(cached);
        }
    } catch (error) {
        // A cache outage must never break the notification scan.
        logger.warn('artist release-group catalog cache read failed', { artistId, error });
    }

    const fromMirror = isMusicDbEnabled() ? buildFromMirror(artistId) : null;
    const catalog = fromMirror ?? (await fetchFromApi(artistId));

    try {
        await replaceCachedData(cacheKey, toCached(catalog), ttl);
    } catch (error) {
        logger.warn('artist release-group catalog cache write failed', { artistId, error });
    }

    return catalog;
};
