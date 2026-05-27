import { useAuth } from '../../../contexts/AuthContext';
import { useBackend } from '../../../hooks/useBackend';

export function useArtistApi() {
    const { getAccessToken } = useAuth();
    const backend = useBackend(getAccessToken);

    return {
        followArtist: backend.followArtist,
        unfollowArtist: backend.unfollowArtist,
        getArtistDetails: backend.getArtistDetails,
        getArtistReleases: backend.getArtistReleases,
        getReleaseGroupReleases: backend.getReleaseGroupReleases,
        waitForTaskResult: backend.waitForTaskResult,
    };
}
