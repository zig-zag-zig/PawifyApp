import { useAuth } from '../../../contexts/AuthContext';
import { useBackend } from '../../../hooks/useBackend';

export function useReleaseApi() {
    const { getAccessToken } = useAuth();
    const backend = useBackend(getAccessToken);

    return {
        getRelease: backend.getRelease,
        getReleaseGroupReleases: backend.getReleaseGroupReleases,
        waitForTaskResult: backend.waitForTaskResult,
    };
}
