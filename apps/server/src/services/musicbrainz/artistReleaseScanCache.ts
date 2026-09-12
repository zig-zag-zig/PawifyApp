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
 * `inc=release-groups+artist-credits` (recordings excluded) is sufficient for
 * the diff and is cheaper than the recordings-inclusive fetch.
 */
export const getArtistReleaseScan = async (
    artistId: string,
    ttl: number | undefined = cacheConfig.releaseScanTtlHours,
): Promise<Release[]> => {
    const cacheKey = getCacheKey(artistId, 'artistReleaseScan');

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

    const releases = await fetchAllReleasesForArtist(artistId, false);
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
    await deleteCachedData(getCacheKey(artistId, 'artistReleaseScan'));
};
