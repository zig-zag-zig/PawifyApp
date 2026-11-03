import {
    getArtistReleases as getArtistReleasesFromService,
    getReleaseGroupReleases as getReleaseGroupReleasesFromService,
} from '../../../services/musicbrainz/cachedReleaseCatalog.js';
import { getRelease as getReleaseFromService } from '../../../services/musicbrainz/releaseLookup.js';
import { fetchMusicBrainzWithStatus } from '../../../services/musicApi/musicBrainzClient.js';
import { isConfirmedMissingFetchFailure } from '../../../services/musicApi/types.js';
import {
    getArtistReleasesFromMirror,
    getReleaseGroupReleasesFromMirror,
    releaseExistsInMirror,
} from '../../../infrastructure/musicDb/musicDbRepositories.js';
import { withMusicDb } from '../../../infrastructure/musicDb/withMusicDb.js';
import { isMusicDbEnabled } from '../../../infrastructure/musicDb/musicDbClient.js';
import { createLogger } from '../../../common/logging/logger.js';
import type { ReleaseCatalogGateway } from '../ports.js';

const logger = createLogger('features.releases.musicBrainzReleaseCatalog');

const releaseExistsFromApi = async (releaseId: string): Promise<boolean> => {
    const result = await fetchMusicBrainzWithStatus(`/release/${releaseId}?fmt=json`, 'HEAD');

    if (result === true) {
        return true;
    }

    if (isConfirmedMissingFetchFailure(result)) {
        return false;
    }

    throw new Error(`Failed to verify release existence for ${releaseId}`);
};

/**
 * Existence check with the mirror as a fast path for *positive* answers only.
 *
 * A mirror hit is authoritative — the release is in the database. A mirror miss is
 * not: the mirror can be up to an hour behind, and this call deletes the user's
 * state for a release it believes is gone. So a miss still asks the API.
 */
export const resolveReleaseExistence = async (
    releaseId: string,
    fromMirror: () => boolean | null,
    fromApi: (releaseId: string) => Promise<boolean>,
): Promise<boolean> => {
    if (isMusicDbEnabled()) {
        try {
            if (fromMirror() === true) {
                return true;
            }
        } catch (error) {
            logger.warn('mirror release-existence check failed; verifying with MusicBrainz', {
                releaseId,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    return await fromApi(releaseId);
};

export const musicBrainzReleaseCatalog: ReleaseCatalogGateway = {
    getArtistReleases: async (artistId, ttl) => {
        return (
            (await withMusicDb(
                'getArtistReleases',
                () => getArtistReleasesFromMirror(artistId),
                async () => await getArtistReleasesFromService(artistId, ttl),
            )) ?? []
        );
    },
    getReleaseGroupReleases: async (releaseGroupId, ttl, onReleaseIdsPage) => {
        // Handled without `withMusicDb` because the API path reports its own pages
        // through `onReleaseIdsPage`; calling it again for the mirror result would
        // duplicate that callback for cover planning.
        if (isMusicDbEnabled()) {
            try {
                const fromMirror = getReleaseGroupReleasesFromMirror(releaseGroupId);
                if (fromMirror !== null) {
                    // The mirror answers in one shot, so this is the only page.
                    await onReleaseIdsPage?.(
                        releaseGroupId,
                        fromMirror.map((release) => release.id),
                        true,
                    );
                    return fromMirror;
                }
            } catch (error) {
                logger.warn('mirror release-group releases failed; using MusicBrainz API', {
                    releaseGroupId,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }

        return await getReleaseGroupReleasesFromService(releaseGroupId, true, ttl, {
            onReleaseIdsPage,
        });
    },
    getRelease: async (releaseId) => await getReleaseFromService(releaseId),
    releaseExists: async (releaseId) =>
        await resolveReleaseExistence(
            releaseId,
            () => releaseExistsInMirror(releaseId),
            releaseExistsFromApi,
        ),
};
