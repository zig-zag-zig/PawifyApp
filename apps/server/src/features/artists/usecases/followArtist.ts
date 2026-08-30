import type { ArtistWriteUseCaseDependencies } from '../ports.js';
import { artistCacheTtlHours } from '../../../services/cache/ttlPolicy.js';
import { mapArtistSummaryToProfileImageLookup } from '../domain/profileImageLookups.js';

export const createFollowArtistUseCase =
    ({
        artistDetailsGateway,
        artistFollowingRepository,
        artistReleaseCatalogGateway,
        artistProfileImageQueue,
        followingNotifier,
        requestDeduper,
    }: Pick<
        ArtistWriteUseCaseDependencies,
        | 'artistDetailsGateway'
        | 'artistFollowingRepository'
        | 'artistReleaseCatalogGateway'
        | 'artistProfileImageQueue'
        | 'followingNotifier'
        | 'requestDeduper'
    >) =>
    async (userId: string, artistId: string, sourcePushToken?: string): Promise<void> => {
        const artistSummary = await artistDetailsGateway.getFollowedArtistSummary(userId, artistId);
        const ttl = artistCacheTtlHours;
        const releaseIds = await artistReleaseCatalogGateway.getArtistReleaseIds(artistId, ttl);

        await artistFollowingRepository.saveFollowedArtist(
            userId,
            artistId,
            releaseIds,
            artistSummary ?? undefined,
        );

        // The write is committed; drop the cached reads that this change affects so
        // the client sees the new following state (and the newly followed artist's
        // details/releases) on the next request instead of up to the dedupe TTL later.
        requestDeduper.invalidate(`getFollowing:${userId}`);
        requestDeduper.invalidate(`getArtistDetails:${userId}:${artistId}`);
        requestDeduper.invalidate(`getArtistReleases:${userId}:${artistId}`);

        artistProfileImageQueue.queueArtistProfileImagesWithLookups(
            userId,
            'follow_artist',
            artistSummary ? [mapArtistSummaryToProfileImageLookup(artistSummary)] : [{ artistId }],
            artistCacheTtlHours,
        );

        await followingNotifier.notifyFollowingChanged(userId, sourcePushToken);
    };
