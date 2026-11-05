import { createLogger } from '../../common/logging/logger.js';
import { withOperationLogging } from '../../common/logging/operationLogger.js';
import { artistDependencies } from './infrastructure/artistDependencies.js';
import { createFollowArtistUseCase } from './usecases/followArtist.js';
import { createGetArtistDetailsUseCase } from './usecases/getArtistDetails.js';
import { createGetFollowingUseCase } from './usecases/getFollowing.js';
import { createResolveFollowingArtistImagesUseCase } from './usecases/resolveFollowingArtistImages.js';
import { createSearchArtistsUseCase } from './usecases/searchArtists.js';
import { createSearchReleaseGroupsUseCase } from './usecases/searchReleaseGroups.js';
import { createSearchAllUseCase } from './usecases/searchAll.js';
import { createUnfollowArtistsUseCase } from './usecases/unfollowArtists.js';
import type { ArtistUseCaseDependencies } from './ports.js';
import type {
    ArtistProfileImagesPlanner,
    ArtistReleaseGroupCoversPlanner,
    ReleaseGroupReleaseCoversPlanner,
} from '../../services/backgroundAssets/plannerTypes.js';

const logger = createLogger('features.artists');

export const createArtistUseCases = (
    assetPlanner: ArtistProfileImagesPlanner &
        ArtistReleaseGroupCoversPlanner &
        ReleaseGroupReleaseCoversPlanner,
) => {
    const dependencies: ArtistUseCaseDependencies = {
        ...artistDependencies,
        assetPlanner,
    };

    return {
        followArtist: withOperationLogging(
            logger,
            'followArtist',
            createFollowArtistUseCase(dependencies),
            {
                successLevel: 'info',
                getMetadata: (_userId, artistId, _sourcePushToken) => ({ artistId }),
            },
        ),
        getArtistDetails: withOperationLogging(
            logger,
            'getArtistDetails',
            createGetArtistDetailsUseCase(dependencies),
            {
                getMetadata: (_userId, artistId) => ({ artistId }),
                getResultMetadata: (result) => ({
                    found: result !== null,
                    profileImageTaskId: result?.profileImageTaskId,
                }),
            },
        ),
        getFollowing: withOperationLogging(
            logger,
            'getFollowing',
            createGetFollowingUseCase(dependencies),
            {
                getResultMetadata: (result) => ({
                    artistCount: result.artists.length,
                    profileImageTaskId: result.profileImageTaskId,
                }),
            },
        ),
        resolveFollowingArtistImages: withOperationLogging(
            logger,
            'resolveFollowingArtistImages',
            createResolveFollowingArtistImagesUseCase(dependencies),
            {
                getMetadata: (_userId, artistIds) => ({ artistCount: artistIds.length }),
                getResultMetadata: (result) => ({
                    resolvedCount: Object.keys(result.profileImages).length,
                    profileImageTaskId: result.profileImageTaskId,
                }),
            },
        ),
        searchArtists: withOperationLogging(
            logger,
            'searchArtists',
            createSearchArtistsUseCase(dependencies),
            {
                getMetadata: (_userId, query, offset, limit) => ({ query, offset, limit }),
                getResultMetadata: (result) => ({ resultCount: result.artists.length }),
            },
        ),
        searchReleaseGroups: withOperationLogging(
            logger,
            'searchReleaseGroups',
            createSearchReleaseGroupsUseCase(dependencies),
            {
                getMetadata: (_userId, query, offset, limit) => ({ query, offset, limit }),
                getResultMetadata: (result) => ({ resultCount: result.releaseGroups.length }),
            },
        ),
        searchAll: withOperationLogging(
            logger,
            'searchAll',
            createSearchAllUseCase(dependencies),
            {
                getMetadata: (_userId, query, offset, limit, category) => ({ query, offset, limit, category }),
                getResultMetadata: (result) => ({
                    artistCount: result.artists.length,
                    releaseGroupCount: result.releaseGroups.length,
                    recordingCount: result.recordings.length,
                }),
            },
        ),
        unfollowArtists: withOperationLogging(
            logger,
            'unfollowArtists',
            createUnfollowArtistsUseCase(dependencies),
            {
                successLevel: 'info',
                getMetadata: (_userId, artistIds, _sourcePushToken) => ({
                    artistCount: artistIds.length,
                }),
            },
        ),
    };
};

export type ArtistUseCases = ReturnType<typeof createArtistUseCases>;
