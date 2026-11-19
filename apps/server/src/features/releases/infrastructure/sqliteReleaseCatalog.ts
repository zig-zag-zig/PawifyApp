import { createLogger } from '../../../common/logging/logger.js';
import type { CachedArtistReleases } from '../../../utils/types/cacheTypes.js';
import {
    getArtistReleasesFromMirror,
    getReleaseFromMirror,
    getReleaseGroupFromMirror,
    releaseExistsInMirror,
} from '../../../infrastructure/musicDb/musicDbRepositories.js';
import {
    cursorForLastGroup,
    decodeArtistReleasesCursor,
    encodeArtistReleasesCursor,
} from '../domain/artistReleasePaging.js';
import type { ArtistReleasesPageResult, ReleaseCatalogGateway } from '../ports.js';

const logger = createLogger('features.releases.sqliteReleaseCatalog');

const buildPage = (groups: CachedArtistReleases, hasMore: boolean): ArtistReleasesPageResult => {
    const last = groups[groups.length - 1];
    return {
        releaseGroups: groups,
        hasMore,
        nextCursor: hasMore && last ? encodeArtistReleasesCursor(cursorForLastGroup(last)) : null,
    };
};

/**
 * Catalogue gateway backed only by the required local mirror.
 *
 * A local miss is a local not-found, not a remote lookup and not an authoritative
 * global deletion. Database failures propagate as `MusicDbUnavailableError` (503)
 * rather than becoming empty catalogue results.
 */
export const sqliteReleaseCatalog: ReleaseCatalogGateway = {
    getArtistReleases: async (artistId) => {
        return getArtistReleasesFromMirror(artistId) ?? [];
    },
    getArtistReleasesPage: async (artistId, page) => {
        const cursor = page.cursor ? decodeArtistReleasesCursor(page.cursor) : null;
        // One extra row tells us whether another page exists without a count.
        const rows = getArtistReleasesFromMirror(artistId, page.limit + 1, 0, cursor);
        if (rows === null) {
            logger.debug('artist release groups not found in local snapshot', { artistId });
            return buildPage([], false);
        }

        const hasMore = rows.length > page.limit;
        return buildPage(hasMore ? rows.slice(0, page.limit) : rows, hasMore);
    },
    getReleaseGroupReleases: async (releaseGroupId) => {
        return getReleaseGroupFromMirror(releaseGroupId);
    },
    getRelease: async (releaseId) => getReleaseFromMirror(releaseId),
    releaseExists: async (releaseId) => releaseExistsInMirror(releaseId),
};
