import { artistCacheTtlHours } from '../../../services/cache/ttlPolicy.js';
import type { ReleaseReadUseCaseDependencies } from '../ports.js';
import type { ReleaseGroupPageEntry } from '../../../utils/types/taskTypes.js';
import type { CachedArtistReleases } from '../../../utils/types/cacheTypes.js';

export type GetArtistReleasesPageResult = {
    releaseGroups: CachedArtistReleases;
    nextCursor: string | null;
    hasMore: boolean;
    releaseGroupCoverTaskId: string | null;
    releaseGroupCovers: Record<string, string | null>;
};

const DEFAULT_PAGE_SIZE = 60;
const MAX_PAGE_SIZE = 200;

/**
 * Paged artist release groups for the v2 contract.
 *
 * Keyset paging, so "load more" costs one page of work instead of re-walking the
 * catalog. The unpaged v1 contract is untouched.
 */
export const createGetArtistReleasesPageUseCase =
    ({
        releaseCatalogGateway,
        releaseTaskQueue,
        assetPlanner,
    }: Pick<
        ReleaseReadUseCaseDependencies,
        'releaseCatalogGateway' | 'releaseTaskQueue' | 'assetPlanner'
    >) =>
    async (
        userId: string,
        artistId: string,
        options: { limit?: number; cursor?: string | null } = {},
    ): Promise<GetArtistReleasesPageResult> => {
        const limit = Math.min(
            Math.max(1, Math.trunc(options.limit ?? DEFAULT_PAGE_SIZE)),
            MAX_PAGE_SIZE,
        );
        const ttl = artistCacheTtlHours;

        const page = await releaseCatalogGateway.getArtistReleasesPage(artistId, ttl, {
            limit,
            cursor: options.cursor ?? null,
        });

        const pageEntries: ReleaseGroupPageEntry[] = page.releaseGroups.map((group) => ({
            releaseGroupId: group.id,
            releaseIds: group.releaseIds,
        }));

        const plan = await assetPlanner.planArtistReleaseGroupCovers({
            userId,
            scope: artistId,
            pageEntries,
            ttl,
        });

        if (plan.taskId !== null) {
            releaseTaskQueue.addTaskUser(plan.taskId, userId);
        }

        return {
            releaseGroups: page.releaseGroups,
            nextCursor: page.nextCursor,
            hasMore: page.hasMore,
            releaseGroupCovers: plan.resolved,
            releaseGroupCoverTaskId: plan.taskId,
        };
    };
