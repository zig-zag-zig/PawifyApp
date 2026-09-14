import type { ReleaseGroupSearchResult } from '../../../services/musicbrainz/releaseGroupSearch.js';
import { transientArtistCacheTtlHours } from '../../../services/cache/ttlPolicy.js';
import type { ReleaseGroupPageEntry } from '../../../utils/types/taskTypes.js';
import type { ArtistReadUseCaseDependencies } from '../ports.js';

export type SearchReleaseGroupsResult = ReleaseGroupSearchResult & {
    releaseGroupCoverTaskId: string | null;
    releaseGroupCovers: Record<string, string | null>;
};

/**
 * Release-group search mirrors artist search's asset handling: the response
 * returns immediately with whatever covers are already cached plus a task id,
 * and the app fills the rest in as the background worker resolves them. The
 * search call itself is never blocked on cover fetching.
 *
 * Covers come from Cover Art Archive by release-group id alone, so this costs
 * no extra MusicBrainz lookups.
 */
export const createSearchReleaseGroupsUseCase =
    ({
        artistSearchGateway,
        assetPlanner,
        requestDeduper,
    }: Pick<
        ArtistReadUseCaseDependencies,
        'artistSearchGateway' | 'assetPlanner' | 'requestDeduper'
    >) =>
    async (
        userId: string,
        query: string,
        offset: number,
        limit: number,
    ): Promise<SearchReleaseGroupsResult> => {
        const result = await requestDeduper.run(
            `searchReleaseGroups:${userId}:${query}:${limit}:${offset}`,
            async () => await artistSearchGateway.searchReleaseGroups(userId, query, offset, limit),
        );

        // A search result carries no release ids, so the group cover is looked
        // up directly by group id.
        const pageEntries: ReleaseGroupPageEntry[] = result.releaseGroups.map((group) => ({
            releaseGroupId: group.id,
            releaseIds: [],
        }));

        const plan = await assetPlanner.planArtistReleaseGroupCovers({
            userId,
            scope: `searchReleaseGroups:${query}:${limit}:${offset}`,
            pageEntries,
            ttl: transientArtistCacheTtlHours,
        });

        return {
            ...result,
            releaseGroupCovers: plan.resolved,
            releaseGroupCoverTaskId: plan.taskId,
        };
    };
