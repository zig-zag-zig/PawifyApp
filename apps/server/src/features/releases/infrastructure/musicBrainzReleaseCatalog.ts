import {
    getArtistReleases as getArtistReleasesFromService,
    getReleaseGroupReleases as getReleaseGroupReleasesFromService,
} from '../../../services/musicbrainz/cachedReleaseCatalog.js';
import {
    getRelease as getReleaseFromService,
    getReleaseTracks as getReleaseTracksFromService,
} from '../../../services/musicbrainz/releaseLookup.js';
import { fetchMusicBrainzWithStatus } from '../../../services/musicApi/musicBrainzClient.js';
import { isConfirmedMissingFetchFailure } from '../../../services/musicApi/types.js';
import type { CachedArtistReleases } from '../../../utils/types/cacheTypes.js';
import {
    getArtistReleasesFromMirror,
    getReleaseGroupReleasesFromMirror,
    releaseExistsInMirror,
} from '../../../infrastructure/musicDb/musicDbRepositories.js';
import { withMusicDb } from '../../../infrastructure/musicDb/withMusicDb.js';
import { isMusicDbEnabled } from '../../../infrastructure/musicDb/musicDbClient.js';
import { createLogger } from '../../../common/logging/logger.js';
import {
    cursorForLastGroup,
    decodeArtistReleasesCursor,
    encodeArtistReleasesCursor,
} from '../domain/artistReleasePaging.js';
import type { ArtistReleasesPageResult, ReleaseCatalogGateway } from '../ports.js';

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
    getArtistReleasesPage: async (artistId, ttl, page) => {
        const cursor = page.cursor ? decodeArtistReleasesCursor(page.cursor) : null;

        const buildPage = (
            groups: CachedArtistReleases,
            hasMore: boolean,
        ): ArtistReleasesPageResult => {
            const last = groups[groups.length - 1];
            return {
                releaseGroups: groups,
                hasMore,
                nextCursor:
                    hasMore && last ? encodeArtistReleasesCursor(cursorForLastGroup(last)) : null,
            };
        };

        const result = await withMusicDb<ArtistReleasesPageResult>(
            'getArtistReleasesPage',
            () => {
                // One extra row tells us whether another page exists without a
                // separate count query.
                const rows = getArtistReleasesFromMirror(artistId, page.limit + 1, 0, cursor);
                if (rows === null) {
                    return null;
                }

                const hasMore = rows.length > page.limit;
                return buildPage(hasMore ? rows.slice(0, page.limit) : rows, hasMore);
            },
            // The API path has no keyset; it fetches the catalog and slices it, which
            // keeps pagination working when the mirror is unavailable.
            async () => {
                const all = await getArtistReleasesFromService(artistId, ttl);
                const start = cursor
                    ? all.findIndex(
                          (group) =>
                              group.date === cursor.sortDate && group.id === cursor.releaseGroupId,
                      ) + 1
                    : 0;
                const releaseGroups = all.slice(start, start + page.limit);
                return buildPage(releaseGroups, start + releaseGroups.length < all.length);
            },
        );

        return (
            result ?? {
                releaseGroups: [],
                hasMore: false,
                nextCursor: null,
            }
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
    getReleaseTracks: async (releaseId) => await getReleaseTracksFromService(releaseId),
    releaseExists: async (releaseId) =>
        await resolveReleaseExistence(
            releaseId,
            () => releaseExistsInMirror(releaseId),
            releaseExistsFromApi,
        ),
};
