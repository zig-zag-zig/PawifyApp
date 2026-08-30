import { createLogger } from '../../common/logging/logger.js';
import { withOperationLogging } from '../../common/logging/operationLogger.js';
import type { ArtistProfileImagesPlanner } from '../../services/backgroundAssets/plannerTypes.js';
import { artistDependencies } from './infrastructure/artistDependencies.js';
import { createFollowArtistUseCase } from './usecases/followArtist.js';
import { createGetArtistDetailsUseCase } from './usecases/getArtistDetails.js';
import { createGetFollowingUseCase } from './usecases/getFollowing.js';
import { createSearchArtistsUseCase } from './usecases/searchArtists.js';
import { createUnfollowArtistsUseCase } from './usecases/unfollowArtists.js';
import type { ArtistUseCaseDependencies } from './ports.js';

const logger = createLogger('features.artists');

export const createArtistUseCases = (assetPlanner: ArtistProfileImagesPlanner) => {
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
        searchArtists: withOperationLogging(
            logger,
            'searchArtists',
            createSearchArtistsUseCase(dependencies),
            {
                getMetadata: (_userId, query, offset, limit) => ({ query, offset, limit }),
                getResultMetadata: (result) => ({ resultCount: result.artists.length }),
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
