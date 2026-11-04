import { createLogger } from '../../common/logging/logger.js';

const logger = createLogger('infrastructure.musicDb.fallback');

/**
 * Runs a mirror query, falling back to the MusicBrainz API when the mirror cannot
 * answer.
 *
 * Two cases, deliberately different:
 *
 * - `null` from the mirror means "the mirror does not have this" (unknown id, no
 *   mirror configured, an artist it has never seen). That is a normal miss and the
 *   API answers it silently.
 * - A thrown error means the mirror is broken. That is logged as a warning before
 *   falling back, because a mirror that keeps failing must be visible rather than
 *   quietly becoming the old API path again.
 *
 * The fallback is not configurable on purpose: it exists so a broken sync job
 * degrades the app instead of taking it down, not so both paths can be run as a
 * product choice.
 */
export const withMusicDb = async <T>(
    operation: string,
    fromMirror: () => T | null,
    fromApi: () => Promise<T | null>,
): Promise<T | null> => {
    try {
        const result = fromMirror();
        if (result !== null) {
            return result;
        }
        logger.debug('mirror miss; using MusicBrainz API', { operation });
    } catch (error) {
        logger.warn('mirror query failed; using MusicBrainz API', {
            operation,
            error: error instanceof Error ? error.message : String(error),
        });
    }

    return await fromApi();
};
