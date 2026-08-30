import { createDefaultAssetPlanner } from './assetPlannerFakes.js';
import type { BackgroundAssetPlanner } from '../../src/services/backgroundAssets/plannerTypes.js';
import type { ReleaseUseCaseDependencies } from '../../src/features/releases/ports.js';

type GetNewReleasesDependencies = Pick<
    ReleaseUseCaseDependencies,
    'newReleasesRepository' | 'assetPlanner'
>;

type NewReleasesSnapshot = Awaited<
    ReturnType<GetNewReleasesDependencies['newReleasesRepository']['getNewReleasesSnapshot']>
>;

export const createGetNewReleasesDependencies = (
    snapshot: NewReleasesSnapshot,
    assetPlannerOverride: BackgroundAssetPlanner = createDefaultAssetPlanner(),
) => {
    const dependencies: GetNewReleasesDependencies = {
        assetPlanner: assetPlannerOverride,
        newReleasesRepository: {
            async getNewReleasesSnapshot() {
                return snapshot;
            },
            async deleteNewReleases() {},
        },
    };

    return {
        dependencies,
    };
};
