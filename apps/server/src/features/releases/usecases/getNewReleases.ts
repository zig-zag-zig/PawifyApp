import type { NewRelease, NewReleasesResult } from '../../../modules/models/models.js';
import { sortNewReleasesNewestFirst } from '../domain/newReleaseSorting.js';
import type { NewReleasesById, ReleaseUseCaseDependencies } from '../ports.js';

const flattenNewReleasesMap = (newReleasesMap: NewReleasesById): NewRelease[] => {
    return Object.values(newReleasesMap);
};

export type GetNewReleasesResult = Omit<NewReleasesResult, 'releaseCoverTaskId'> & {
    releaseCoverTaskId: string | null;
    releaseCovers: Record<string, string | null>;
};

export const createGetNewReleasesUseCase =
    ({
        newReleasesRepository,
        assetPlanner,
    }: Pick<ReleaseUseCaseDependencies, 'newReleasesRepository' | 'assetPlanner'>) =>
    async (userId: string): Promise<GetNewReleasesResult> => {
        const snapshot = await newReleasesRepository.getNewReleasesSnapshot(userId);
        const releases = sortNewReleasesNewestFirst(flattenNewReleasesMap(snapshot.newReleasesMap));
        const plan = await assetPlanner.planNewReleaseCovers({
            userId,
            pageEntries: snapshot.coverPageEntries,
        });

        return {
            releases,
            releaseCovers: plan.resolved,
            releaseCoverTaskId: plan.taskId,
        };
    };
