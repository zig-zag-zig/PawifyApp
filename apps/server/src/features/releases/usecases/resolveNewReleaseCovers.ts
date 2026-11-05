import type { ReleaseUseCaseDependencies } from '../ports.js';

export type ResolveNewReleaseCoversResult = {
    releaseCovers: Record<string, string | null>;
    releaseCoverTaskId: string | null;
};

/**
 * Resolves covers for a slice of the new-release feed.
 *
 * The feed request used to plan covers for every entry, so a cold start queued
 * artwork for rows that might never be shown. The client asks for the page it is
 * about to render; only entries containing a requested release survive the filter.
 */
export const createResolveNewReleaseCoversUseCase =
    ({ newReleasesRepository, assetPlanner }: Pick<
        ReleaseUseCaseDependencies,
        'newReleasesRepository' | 'assetPlanner'
    >) =>
    async (userId: string, releaseIds: string[]): Promise<ResolveNewReleaseCoversResult> => {
        if (releaseIds.length === 0) {
            return { releaseCovers: {}, releaseCoverTaskId: null };
        }

        const requested = new Set(releaseIds);
        const snapshot = await newReleasesRepository.getNewReleasesSnapshot(userId);
        const pageEntries = snapshot.coverPageEntries
            .map((entry) => ({
                releaseGroupId: entry.releaseGroupId,
                releaseIds: entry.releaseIds.filter((releaseId) => requested.has(releaseId)),
            }))
            .filter((entry) => entry.releaseIds.length > 0);

        if (pageEntries.length === 0) {
            return { releaseCovers: {}, releaseCoverTaskId: null };
        }

        const plan = await assetPlanner.planNewReleaseCovers({ userId, pageEntries });

        return { releaseCovers: plan.resolved, releaseCoverTaskId: plan.taskId };
    };
