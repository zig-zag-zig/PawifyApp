import type { ArtistWriteUseCaseDependencies } from '../ports.js';

export const createUnfollowArtistsUseCase = ({
    artistFollowingRepository,
    followingNotifier,
    requestDeduper,
}: Pick<
    ArtistWriteUseCaseDependencies,
    'artistFollowingRepository' | 'followingNotifier' | 'requestDeduper'
>) => {
    const unfollowSingleArtist = async (userId: string, artistId: string): Promise<void> => {
        await artistFollowingRepository.deleteFollowedArtist(userId, artistId);
    };

    return async (userId: string, artistIds: string[], sourcePushToken?: string): Promise<void> => {
        for (const artistId of artistIds) {
            await unfollowSingleArtist(userId, artistId);

            // Drop the per-artist read caches for this user so a re-follow or a
            // fresh artist read does not serve the pre-unfollow state.
            requestDeduper.invalidate(`getArtistDetails:${userId}:${artistId}`);
            requestDeduper.invalidate(`getArtistReleases:${userId}:${artistId}`);
        }

        // The following list itself changed for this user.
        requestDeduper.invalidate(`getFollowing:${userId}`);

        await followingNotifier.notifyFollowingChanged(userId, sourcePushToken);
    };
};
