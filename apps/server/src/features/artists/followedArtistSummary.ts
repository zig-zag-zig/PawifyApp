import type { Artist } from '../../modules/models/models.js';
import type { FollowedArtistSummary } from '../../utils/types/followedArtistTypes.js';

export const mapArtistToFollowedArtistSummary = (
    artist: Artist,
    refreshedAt: number = Date.now(),
): FollowedArtistSummary => {
    return {
        id: artist.id,
        name: artist.name,
        refreshedAt,
    };
};
