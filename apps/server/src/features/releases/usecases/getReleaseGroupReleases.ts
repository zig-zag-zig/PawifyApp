import type { ReleaseGroupReleaseListItem } from '@pawify/shared';
import type { ReleaseReadUseCaseDependencies } from '../ports.js';
import type { ReleaseGroupReleasesPageEntry } from '../../../utils/types/taskTypes.js';

type GetReleaseGroupReleasesResult = {
    releases: ReleaseGroupReleaseListItem[];
    releaseCoverTaskId: string | null;
    releaseCovers: Record<string, string | null>;
};

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
            async () => {
                const coverPageEntries: ReleaseGroupReleasesPageEntry[] = [];

                const releases = await releaseCatalogGateway.getReleaseGroupReleases(
                    releaseGroupId,
                    undefined,
                    async (groupId, releaseIds) => {
                        coverPageEntries.push({
                            releaseGroupId: groupId,
                            releaseIds,
                        });
                    },
                );

                return {
                    releases,
                    coverPageEntries,
                };
            },
        );

        const plan = await assetPlanner.planReleaseGroupReleaseCovers({
            userId,
            releaseGroupId,
            pageEntries: payload.coverPageEntries,
            ttl: undefined,
        });

        if (plan.taskId !== null) {
            releaseTaskQueue.addTaskUser(plan.taskId, userId);
        }

        return {
            releases: payload.releases,
            releaseCovers: plan.resolved,
            releaseCoverTaskId: plan.taskId,
        };
    };
