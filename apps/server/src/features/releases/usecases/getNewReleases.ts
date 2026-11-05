import type { NewRelease } from '@pawify/shared';

export type NewReleasesResult = {
    releases: NewRelease[];
    releaseCoverTaskId: string;
};
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
        // Cached covers only: the feed can be long, and planning here queued artwork
        // for every entry before the screen was even opened. The client requests the
        // page it is about to show via resolveNewReleaseCovers.
        const releaseCovers = await assetPlanner.peekNewReleaseCovers(snapshot.coverPageEntries);

        return {
            releases,
            releaseCovers,
            releaseCoverTaskId: null,
        };
    };
