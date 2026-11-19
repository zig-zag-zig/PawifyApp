import { getMusicDb, MusicDbUnavailableError } from './musicDbClient.js';

/**
 * Catalogue readiness is a property of the mirror open, not of individual
 * releases.
 *
 * `musicDbClient` asserts the reader schema, the required FTS tables and the
 * `track_data_state=ready` marker before returning a handle. A release with an
 * empty `media`/`tracks` set in a ready mirror is genuinely known to be empty;
 * a database that cannot answer at all throws a retriable service error.
 */
export const assertCatalogueReady = (): void => {
    getMusicDb();
};

export const canServeEditionMetadata = (): boolean => {
    try {
        getMusicDb();
        return true;
    } catch (error) {
        if (error instanceof MusicDbUnavailableError) return false;
        throw error;
    }
};

export const canServeTrackData = (): boolean => canServeEditionMetadata();
