import { createLogger } from '../../common/logging/logger.js';
import { deleteCachedData } from '../cacheService.js';
import { musicDbHasEntityImages } from '../../infrastructure/musicDb/musicDbClient.js';

const logger = createLogger('services.cache.legacyImagePurge');

/**
 * Cache key prefixes that used to hold artwork and mirror-backed catalog data.
 *
 * Once `entity_images` exists in the mirror, every one of these is a duplicate: the
 * artwork is a primary-key lookup in SQLite and the catalog comes from the mirror
 * tables. They are deleted on boot so a deployment does not keep serving stale
 * copies (and so Redis stops holding image data at all).
 */
const LEGACY_KEY_PATTERNS = [
    'asset:artist-image:',
    'asset:group-cover:',
    'asset:release-cover:',
] as const;

const LEGACY_KEY_SUFFIXES = [
    '_artistImages',
    '_artistDetails',
    '_artistReleases',
    '_releaseGroupReleases',
    '_releaseGroupReleaseCovers',
] as const;

/**
 * Best-effort purge of the pre-mirror cache entries.
 *
 * Dapr's state API has no SCAN, so this only removes keys the server can name. It is
 * intentionally quiet: a failure here must never block startup, and the entries
 * expire on their own TTL anyway.
 */
export const purgeLegacyImageCache = async (knownIds: readonly string[] = []): Promise<number> => {
    if (!musicDbHasEntityImages()) {
        return 0;
    }

    const keys = new Set<string>();
    for (const id of knownIds) {
        for (const pattern of LEGACY_KEY_PATTERNS) {
            keys.add(`${pattern}${id}`);
        }
        for (const suffix of LEGACY_KEY_SUFFIXES) {
            keys.add(`${id}${suffix}`);
        }
    }

    let deleted = 0;
    for (const key of keys) {
        try {
            await deleteCachedData(key);
            deleted += 1;
        } catch {
            // Missing keys are the normal case; nothing to report.
        }
    }

    if (deleted > 0) {
        logger.info('purged legacy artwork cache entries', { attempted: keys.size });
    }
    return deleted;
};
