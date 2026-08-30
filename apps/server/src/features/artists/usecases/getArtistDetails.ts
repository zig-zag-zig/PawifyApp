import type { Artist } from '@pawify/shared';
import { mapArtistToProfileImageLookup } from '../domain/profileImageLookups.js';
import { artistCacheTtlHours } from '../../../services/cache/ttlPolicy.js';
import type { ArtistReadUseCaseDependencies } from '../ports.js';

type GetArtistDetailsResult = {
    artist: Artist;
    profileImageTaskId: string | null;
    profileImages: Record<string, string | null>;
} | null;

export const createGetArtistDetailsUseCase =
    ({
        artistDetailsGateway,
        assetPlanner,
        requestDeduper,
    }: Pick<
        ArtistReadUseCaseDependencies,
        'artistDetailsGateway' | 'assetPlanner' | 'requestDeduper'
    >) =>
    async (userId: string, artistId: string): Promise<GetArtistDetailsResult> => {
        const ttl = artistCacheTtlHours;
        const artist = await requestDeduper.run(
            `getArtistDetails:${userId}:${artistId}`,
            async () => await artistDetailsGateway.getArtistDetails(userId, artistId),
        );

        if (!artist) {
            return null;
        }

        const lookup = mapArtistToProfileImageLookup(artistId, artist);
        const plan = await assetPlanner.planArtistProfileImages({
            userId,
            scope: 'artist_details',
            lookups: [lookup],
            ttl,
        });

        return {
            artist,
            profileImages: plan.resolved,
            profileImageTaskId: plan.taskId,
        };
    };
