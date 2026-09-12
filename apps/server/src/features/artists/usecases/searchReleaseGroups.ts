import type { ReleaseGroupSearchResult } from '../../../services/musicbrainz/releaseGroupSearch.js';
import type { ArtistReadUseCaseDependencies } from '../ports.js';

export type SearchReleaseGroupsResult = ReleaseGroupSearchResult;

/**
 * Release-group search shares the artist-search seam but needs no asset
 * planning: release groups have no profile images, and covers are resolved by
 * the release-group page itself on open.
 */
export const createSearchReleaseGroupsUseCase =
    ({
        artistSearchGateway,
        requestDeduper,
    }: Pick<ArtistReadUseCaseDependencies, 'artistSearchGateway' | 'requestDeduper'>) =>
    async (
        userId: string,
        query: string,
        offset: number,
        limit: number,
    ): Promise<SearchReleaseGroupsResult> => {
        return await requestDeduper.run(
            `searchReleaseGroups:${userId}:${query}:${limit}:${offset}`,
            async () => await artistSearchGateway.searchReleaseGroups(userId, query, offset, limit),
        );
    };
