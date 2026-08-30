import type { ArtistSearchResult } from '@pawify/shared';
import { transientArtistCacheTtlHours } from '../../../services/cache/ttlPolicy.js';
import type { ArtistReadUseCaseDependencies } from '../ports.js';

export type SearchArtistsResult = ArtistSearchResult & {
    profileImageTaskId: string | null;
    profileImages: Record<string, string | null>;
};

export const createSearchArtistsUseCase =
    ({
        artistSearchGateway,
        assetPlanner,
        requestDeduper,
    }: Pick<
        ArtistReadUseCaseDependencies,
        'artistSearchGateway' | 'assetPlanner' | 'requestDeduper'
    >) =>
    async (
        userId: string,
        query: string,
        offset: number,
        limit: number,
    ): Promise<SearchArtistsResult> => {
        const result = await requestDeduper.run(
            `searchArtists:${userId}:${query}:${limit}:${offset}`,
            async () => await artistSearchGateway.searchArtists(userId, query, offset, limit),
        );
        const artistLookups = result.artists.map((artist) => ({
            artistId: artist.id,
            artistName: artist.name,
        }));
        const plan = await assetPlanner.planArtistProfileImages({
            userId,
            scope: `search:${query}:${limit}:${offset}`,
            lookups: artistLookups,
            ttl: transientArtistCacheTtlHours,
        });

        return {
            ...result,
            profileImages: plan.resolved,
            profileImageTaskId: plan.taskId,
        };
    };
