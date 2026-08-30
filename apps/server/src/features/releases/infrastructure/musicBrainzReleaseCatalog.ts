import {
    getArtistReleases as getArtistReleasesFromService,
    getReleaseGroupReleases as getReleaseGroupReleasesFromService,
} from '../../../services/musicbrainz/cachedReleaseCatalog.js';
import { getRelease as getReleaseFromService } from '../../../services/musicbrainz/releaseLookup.js';
import { fetchMusicBrainzWithStatus } from '../../../services/musicApi/musicBrainzClient.js';
import { isConfirmedMissingFetchFailure } from '../../../services/musicApi/types.js';
import type { ReleaseCatalogGateway } from '../ports.js';

export const musicBrainzReleaseCatalog: ReleaseCatalogGateway = {
    getArtistReleases: async (artistId, ttl) => {
        return await getArtistReleasesFromService(artistId, ttl);
    },
    getReleaseGroupReleases: async (releaseGroupId, ttl, onReleaseIdsPage) => {
        return await getReleaseGroupReleasesFromService(releaseGroupId, true, ttl, {
            onReleaseIdsPage,
        });
    },
    getRelease: async (releaseId) => await getReleaseFromService(releaseId),
    releaseExists: async (releaseId) => {
        const result = await fetchMusicBrainzWithStatus(`/release/${releaseId}?fmt=json`, 'HEAD');

        if (result === true) {
            return true;
        }

        if (isConfirmedMissingFetchFailure(result)) {
            return false;
        }

        throw new Error(`Failed to verify release existence for ${releaseId}`);
    },
};
