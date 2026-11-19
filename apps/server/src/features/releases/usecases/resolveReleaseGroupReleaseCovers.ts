import type { ReleaseUseCaseDependencies } from '../ports.js';

export type ResolveReleaseGroupReleaseCoversResult = {
    releaseCovers: Record<string, string | null>;
    releaseCoverTaskId: string | null;
};

/**
 * Resolves artwork for a visible slice of one release group's editions.
 *
 * This is the enrichment replay endpoint: it validates the ids against the local
 * group and queues only pending visible covers. It never refetches the catalogue
 * to obtain another task id and never starts lyrics work.
 */
export const createResolveReleaseGroupReleaseCoversUseCase =
    ({
        releaseCatalogGateway,
        releaseTaskQueue,
        assetPlanner,
    }: Pick<
        ReleaseUseCaseDependencies,
        'releaseCatalogGateway' | 'releaseTaskQueue' | 'assetPlanner'
    >) =>
    async (
        userId: string,
        releaseGroupId: string,
        releaseIds: string[],
    ): Promise<ResolveReleaseGroupReleaseCoversResult> => {
        if (releaseIds.length === 0) {
            return { releaseCovers: {}, releaseCoverTaskId: null };
        }

        const group = await releaseCatalogGateway.getReleaseGroupReleases(releaseGroupId);
        if (!group) {
            return { releaseCovers: {}, releaseCoverTaskId: null };
        }

        const knownIds = new Set(group.releases.map((release) => release.id));
        const requested = releaseIds.filter((releaseId) => knownIds.has(releaseId));
        if (requested.length === 0) {
            return { releaseCovers: {}, releaseCoverTaskId: null };
        }

        const plan = await assetPlanner.planReleaseGroupReleaseCovers({
            userId,
            releaseGroupId,
            pageEntries: [{ releaseGroupId, releaseIds: requested }],
            ttl: undefined,
        });

        if (plan.taskId !== null) {
            releaseTaskQueue.addTaskUser(plan.taskId, userId);
        }

        return { releaseCovers: plan.resolved, releaseCoverTaskId: plan.taskId };
    };
