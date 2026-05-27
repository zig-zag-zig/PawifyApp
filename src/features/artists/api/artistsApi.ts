import { useAuth } from '../../../contexts/AuthContext';
import { useBackend } from '../../../hooks/useBackend';

export function useArtistsApi() {
    const { getAccessToken } = useAuth();
    const backend = useBackend(getAccessToken);

    return {
        unfollowArtists: backend.unfollowArtists,
    };
}
