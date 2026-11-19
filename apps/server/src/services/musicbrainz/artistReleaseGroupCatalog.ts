import type { ArtistCredit } from '@pawify/shared';

import { getArtistReleaseGroupCandidatesFromMirror } from '../../infrastructure/musicDb/musicDbRepositories.js';
import type { ReleaseGroupCandidate } from '../../features/releases/domain/releaseGroupProcessing.js';

export type ArtistReleaseGroupCatalog = {
    groups: ReleaseGroupCandidate[];
    /** Artist credits per group, for building a feed entry without another lookup. */
    creditsByGroupId: Map<string, ArtistCredit[]>;
    /**
     * False when the catalogue is capped or unresolved. Incomplete catalogues must
     * not prune, baseline or notify.
     */
    complete: boolean;
};

/**
 * Release-group catalog used by new-release detection and settings.
 *
 * Read straight from the required local mirror; there is no MusicBrainz Web
 * Service catalogue path. A mirror failure throws, and the notification runner
 * treats the artist scan as failed rather than as an empty/complete catalogue.
 */
export const getArtistReleaseGroupCatalog = async (
    artistId: string,
): Promise<ArtistReleaseGroupCatalog> => {
    const catalog = getArtistReleaseGroupCandidatesFromMirror(artistId);

    if (catalog === null) {
        // Artist unknown to the local snapshot. It is not a complete empty
        // catalogue: preserving state and emitting nothing is the safe answer.
        return { groups: [], creditsByGroupId: new Map(), complete: false };
    }

    return {
        groups: catalog.groups,
        creditsByGroupId: new Map(),
        complete: catalog.complete,
    };
};
