import { artistCacheTtlHours } from '../../../services/cache/ttlPolicy.js';
import { mapArtistSummaryToProfileImageLookup } from '../domain/profileImageLookups.js';
import type { ArtistProfileImageLookup } from '../../../utils/types/taskTypes.js';
import type { ArtistReadUseCaseDependencies } from '../ports.js';

export type ResolveFollowingArtistImagesResult = {
    profileImages: Record<string, string | null>;
    profileImageTaskId: string | null;
};

/**
 * Resolves profile images for a slice of the followed artists.
 *
 * The feed no longer plans images for every followed artist on cold start; the
 * client asks for the page it is about to display. Ids that are not followed are
 * ignored rather than looked up, so this cannot be used to warm arbitrary artists.
 */
export const createResolveFollowingArtistImagesUseCase =
    ({
        artistFollowingRepository,
        assetPlanner,
    }: Pick<ArtistReadUseCaseDependencies, 'artistFollowingRepository' | 'assetPlanner'>) =>
    async (
        userId: string,
        artistIds: string[],
    ): Promise<ResolveFollowingArtistImagesResult> => {
        if (artistIds.length === 0) {
            return { profileImages: {}, profileImageTaskId: null };
        }

        const { artistSummaries } = await artistFollowingRepository.getFollowingState(userId);

        const lookups: ArtistProfileImageLookup[] = [];
        for (const artistId of artistIds) {
            const summary = artistSummaries[artistId];
            if (summary) {
                lookups.push(mapArtistSummaryToProfileImageLookup(summary));
            }
        }

        if (lookups.length === 0) {
            return { profileImages: {}, profileImageTaskId: null };
        }

        const plan = await assetPlanner.planArtistProfileImages({
            userId,
            scope: 'following',
            lookups,
            ttl: artistCacheTtlHours,
        });

        return { profileImages: plan.resolved, profileImageTaskId: plan.taskId };
    };
