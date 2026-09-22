import type { Release } from '@pawify/shared';
import { deleteCachedData, getCachedData, replaceCachedData } from '../cacheService.js';
import { getCacheKey } from '../../utils/helpers/cacheHelpers.js';
import { cacheConfig } from '../../config/runtimeConfig.js';
import { createLogger } from '../../common/logging/logger.js';
import { fetchAllReleasesForArtist } from './releaseQueries.js';

const logger = createLogger('services.musicbrainz.artistReleaseScanCache');

/**
 * Global, per-artist cache of the flat release catalog used by the
 * new-release notification scan.
 *
 * The notification runner scans every followed artist for every user. Without
 * this cache that is O(users x followed artists) MusicBrainz requests per run.
 * The release catalog for a given artist is user-independent, so it can be
 * cached once per artist and reused by every user's diff. Per-user state (which
 * of those releases are "new") is still computed per user from their own
 * known-release set in `analyzeReleaseChanges`.
 *
 * Cached as the flat `Release[]` (not the grouped `CachedArtistReleases` used by
 * the browse path) because the notification diff operates on individual release
 * ids, dates, and release-group ids.
 *
 * `inc=recordings` IS requested here, unlike the browse path. The diff collapses
 * the releases of a release group that are duplicates, and that comparison is
 * tracklist-based (see `isDuplicateRelease`). Without track data every release
 * arrives with an empty track list, the comparison has nothing to work with, and
 * one album with several MusicBrainz releases (digital + CD + vinyl + a regional
 * pressing) becomes one "new release" each.
 *
 * The extra bytes do not cost extra MusicBrainz requests: pagination is driven by
 * `release-count`, so it is the same number of pages, just larger ones. The cache
 * below is also global per artist, so that cost is paid once per artist per TTL
 * rather than once per user.
 */
export const getArtistReleaseScan = async (
    artistId: string,
    ttl: number | undefined = cacheConfig.releaseScanTtlHours,
): Promise<Release[]> => {
    // Key carries the fetch shape: entries cached before recordings were
    // requested hold no track data and would silently disable the dedupe for the
    // rest of their TTL.
    const cacheKey = getCacheKey(artistId, 'artistReleaseScanWithRecordings');

    try {
        const cached = await getCachedData<Release[]>(cacheKey);
        if (cached) {
            logger.debug('artist release scan cache hit', {
                artistId,
                releaseCount: cached.length,
            });
            return cached;
        }
        logger.debug('artist release scan cache miss', { artistId });
    } catch (error) {
        // A cache outage must never break the notification scan — fall through
        // to the direct fetch exactly as before this cache existed.
        logger.warn('artist release scan cache read failed; falling back to MusicBrainz', {
            artistId,
            error,
        });
    }

    const releases = await fetchAllReleasesForArtist(artistId, true);
    logger.debug('artist release scan fetched from MusicBrainz', {
        artistId,
        releaseCount: releases.length,
    });

    try {
        await replaceCachedData(cacheKey, releases, ttl);
    } catch (error) {
        // Cache failures must never break the notification scan.
        logger.warn('artist release scan cache write failed', {
            artistId,
            releaseCount: releases.length,
            error,
        });
    }

    return releases;
};

export const invalidateArtistReleaseScan = async (artistId: string): Promise<void> => {
    await deleteCachedData(getCacheKey(artistId, 'artistReleaseScanWithRecordings'));
};
