import { createLogger } from '../../common/logging/logger.js';
import { musicDbConfig } from '../../config/runtimeConfig.js';

const logger = createLogger('infrastructure.musicDb.fallback');

/**
 * Runs a mirror query, falling back to the MusicBrainz API when the mirror cannot
 * answer.
 *
 * Two distinct cases, deliberately handled differently:
 *
 * - `null` from the mirror means "the mirror does not have this" (feature off,
 *   file missing, unknown id). That is a normal miss, so the API answers it
 *   silently when fallback is enabled.
 * - A thrown error means the mirror is broken or the data is unexpected. That is
 *   logged as a warning before falling back, because a mirror that keeps failing
 *   should be visible rather than quietly degrading into the old API path.
 *
 * With `MUSIC_DB_FALLBACK_TO_API=false` a failure propagates, which is what a
 * canary deployment wants.
 */
export const withMusicDb = async <T>(
    operation: string,
    fromMirror: () => T | null,
    fromApi: () => Promise<T | null>,
): Promise<T | null> => {
    if (!musicDbConfig.enabled) {
        return await fromApi();
    }

    try {
        const result = fromMirror();
        if (result !== null) {
            return result;
        }
        logger.debug('mirror miss; using MusicBrainz API', { operation });
    } catch (error) {
        if (!musicDbConfig.fallbackToApi) {
            throw error;
        }
        logger.warn('mirror query failed; using MusicBrainz API', {
            operation,
            error: error instanceof Error ? error.message : String(error),
        });
    }

    return await fromApi();
};
