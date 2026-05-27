import { useAuth } from '../../../contexts/AuthContext';
import { useBackend } from '../../../hooks/useBackend';

export function useSearchApi() {
    const { getAccessToken } = useAuth();
    const backend = useBackend(getAccessToken);

    return {
        searchArtists: backend.searchArtists,
        waitForTaskResult: backend.waitForTaskResult,
    };
}
