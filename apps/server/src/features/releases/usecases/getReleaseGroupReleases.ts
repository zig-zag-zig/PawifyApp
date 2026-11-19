import type { ReleaseGroup, ReleaseGroupReleaseListItem } from '@pawify/shared';
import type { ReleaseReadUseCaseDependencies } from '../ports.js';

export type GetReleaseGroupReleasesResult = {
    releaseGroup: ReleaseGroup;
    releases: ReleaseGroupReleaseListItem[];
    releaseCount: number;
    releaseCoverTaskId: string | null;
    releaseCovers: Record<string, string | null>;
} | null;

/**
 * Release-group screen data from one local snapshot.
 *
 * The group identity and edition list are read together, and cover inputs are
 * constructed once from the actual result. There is no upstream page callback to
 * accumulate: the mirror answers the whole group.
 */
export const createGetReleaseGroupReleasesUseCase =
    ({
        releaseCatalogGateway,
        releaseTaskQueue,
        assetPlanner,
        requestDeduper,
    }: Pick<
        ReleaseReadUseCaseDependencies,
        'releaseCatalogGateway' | 'releaseTaskQueue' | 'assetPlanner' | 'requestDeduper'
    >) =>
    async (userId: string, releaseGroupId: string): Promise<GetReleaseGroupReleasesResult> => {
        const payload = await requestDeduper.run(
            `getReleaseGroupReleases:${userId}:${releaseGroupId}`,
            async () => await releaseCatalogGateway.getReleaseGroupReleases(releaseGroupId),
        );

        if (!payload) {
            return null;
        }

        const plan = await assetPlanner.planReleaseGroupReleaseCovers({
            userId,
            releaseGroupId,
            pageEntries: [
                {
                    releaseGroupId,
                    releaseIds: payload.releases.map((release) => release.id),
                },
            ],
            ttl: undefined,
        });

        if (plan.taskId !== null) {
            releaseTaskQueue.addTaskUser(plan.taskId, userId);
        }

        return {
            releaseGroup: payload.releaseGroup,
            releases: payload.releases,
            releaseCount: payload.releaseCount,
            releaseCovers: plan.resolved,
            releaseCoverTaskId: plan.taskId,
        };
    };
