import { isArtistMetadataStale } from '../artistMetadataRefresh.js';
import { createLogger } from '../../../common/logging/logger.js';
import type { ArtistMinimal } from '../../../modules/models/models.js';
import { mapWithConcurrency } from '../../../utils/helpers/promisePool.js';
import { artistCacheTtlHours } from '../../../services/cache/ttlPolicy.js';
import type { ArtistProfileImageLookup } from '../../../utils/types/taskTypes.js';
import { mapArtistSummaryToProfileImageLookup } from '../domain/profileImageLookups.js';
import type { ArtistReadUseCaseDependencies } from '../ports.js';

const logger = createLogger('features.artists').child('getFollowing');

type GetFollowingResult = {
    artists: ArtistMinimal[];
    profileImageTaskId: string | null;
    profileImages: Record<string, string | null>;
};

export const createGetFollowingUseCase =
    ({
        artistDetailsGateway,
        artistFollowingRepository,
        assetPlanner,
        requestDeduper,
    }: Pick<
        ArtistReadUseCaseDependencies,
        'artistDetailsGateway' | 'artistFollowingRepository' | 'assetPlanner' | 'requestDeduper'
    >) =>
    async (userId: string): Promise<GetFollowingResult> => {
        const payload = await requestDeduper.run(`getFollowing:${userId}`, async () => {
            const followingState = await artistFollowingRepository.getFollowingState(userId);
            const artistIds = followingState.artistIds;
            const storedArtistSummaries = { ...followingState.artistSummaries };

            const staleOrMissingArtistIds = artistIds.filter((artistId) => {
                const summary = storedArtistSummaries[artistId];
                return !summary || isArtistMetadataStale(summary.refreshedAt);
            });

            if (staleOrMissingArtistIds.length > 0) {
                const fetchedSummaries = (
                    await mapWithConcurrency(
                        staleOrMissingArtistIds,
                        4,
                        async (artistId) =>
                            await artistDetailsGateway.getFollowedArtistSummary(userId, artistId),
                    )
                ).filter(
                    (artistSummary): artistSummary is NonNullable<typeof artistSummary> =>
                        artistSummary !== null,
                );

                if (fetchedSummaries.length > 0) {
                    for (const artist of fetchedSummaries) {
                        storedArtistSummaries[artist.id] = artist;
                    }

                    try {
                        await artistFollowingRepository.saveFollowingArtistSummaries(
                            userId,
                            fetchedSummaries,
                        );
                    } catch (error) {
                        logger.warn('failed to persist following artist summaries', {
                            userId,
                            error,
                        });
                    }
                }
            }

            const artists: ArtistMinimal[] = [];
            const artistLookups: ArtistProfileImageLookup[] = [];

            for (const artistId of artistIds) {
                const summary = storedArtistSummaries[artistId];

                if (!summary) {
                    continue;
                }

                artists.push({
                    id: summary.id,
                    name: summary.name,
                });

                artistLookups.push(mapArtistSummaryToProfileImageLookup(summary));
            }

            return {
                artists,
                artistLookups,
            };
        });

        const plan = await assetPlanner.planArtistProfileImages({
            userId,
            scope: 'following',
            lookups: payload.artistLookups,
            ttl: artistCacheTtlHours,
        });

        return {
            artists: payload.artists,
            profileImages: plan.resolved,
            profileImageTaskId: plan.taskId,
        };
    };
