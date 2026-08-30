import { createLogger } from '../../common/logging/logger.js';
import { withOperationLogging } from '../../common/logging/operationLogger.js';
import type { BackgroundAssetPlanner } from '../../services/backgroundAssets/plannerTypes.js';
import { releaseDependencies } from './infrastructure/releaseDependencies.js';
import { createGetArtistReleasesUseCase } from './usecases/getArtistReleases.js';
import { createGetNewReleasesUseCase } from './usecases/getNewReleases.js';
import { createGetReleaseUseCase } from './usecases/getRelease.js';
import { createGetReleaseGroupReleasesUseCase } from './usecases/getReleaseGroupReleases.js';
import { createRemoveNewReleasesUseCase } from './usecases/removeNewReleases.js';
import { createVerifyReleaseExistenceUseCase } from './usecases/verifyReleaseExistence.js';
import type { ReleaseUseCaseDependencies } from './ports.js';

const logger = createLogger('features.releases');

export const createReleaseUseCases = (assetPlanner: BackgroundAssetPlanner) => {
    const dependencies: ReleaseUseCaseDependencies = {
        ...releaseDependencies,
        assetPlanner,
    };

    return {
        getArtistReleases: withOperationLogging(
            logger,
            'getArtistReleases',
            createGetArtistReleasesUseCase(dependencies),
            {
                getMetadata: (_userId, artistId) => ({ artistId }),
                getResultMetadata: (result) => ({
                    releaseGroupCount: result.releaseGroups.length,
                    releaseGroupCoverTaskId: result.releaseGroupCoverTaskId,
                }),
            },
        ),
        getNewReleases: withOperationLogging(
            logger,
            'getNewReleases',
            createGetNewReleasesUseCase(dependencies),
            {
                getResultMetadata: (result) => ({
                    releaseCount: result.releases.length,
                    releaseCoverTaskId: result.releaseCoverTaskId,
                }),
            },
        ),
        getRelease: withOperationLogging(
            logger,
            'getRelease',
            createGetReleaseUseCase(dependencies),
            {
                getMetadata: (_userId, releaseId) => ({ releaseId }),
                getResultMetadata: (result) => ({
                    found: result !== null,
                    lyricsTaskId: result?.lyricsTaskId,
                    profileImageTaskId: result?.profileImageTaskId,
                }),
            },
        ),
        getReleaseGroupReleases: withOperationLogging(
            logger,
            'getReleaseGroupReleases',
            createGetReleaseGroupReleasesUseCase(dependencies),
            {
                getMetadata: (_userId, releaseGroupId) => ({ releaseGroupId }),
                getResultMetadata: (result) => ({
                    releaseCount: result.releases.length,
                    releaseCoverTaskId: result.releaseCoverTaskId,
                }),
            },
        ),
        removeNewReleases: withOperationLogging(
            logger,
            'removeNewReleases',
            createRemoveNewReleasesUseCase(dependencies),
            {
                successLevel: 'info',
                getMetadata: (_userId, releaseIds, _sourcePushToken) => ({
                    releaseCount: releaseIds.length,
                }),
            },
        ),
        verifyReleaseExistence: withOperationLogging(
            logger,
            'verifyReleaseExistence',
            createVerifyReleaseExistenceUseCase(dependencies),
            {
                successLevel: 'info',
                getMetadata: (_userId, releaseId) => ({ releaseId }),
                getResultMetadata: (result) => ({ exists: result.exists }),
            },
        ),
    };
};

export type ReleaseUseCases = ReturnType<typeof createReleaseUseCases>;
