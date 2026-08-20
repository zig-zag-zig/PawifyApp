import { useMemo } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useApiClient } from '../../../hooks/useApiClient';
import type {
    NewReleasesResponse,
    ReleaseGroupReleasesResponse,
    ReleaseResponse,
} from '../../../types/apiTypes';

export function useReleaseApi() {
    const { getAccessToken } = useAuth();
    const apiClient = useApiClient(getAccessToken);

    return useMemo(() => {
        return {
            getRelease: async (releaseId: string) =>
                await apiClient.request<ReleaseResponse>('getRelease', {
                    body: { releaseId },
                }),
            getReleaseGroupReleases: async (releaseGroupId: string) =>
                await apiClient.request<ReleaseGroupReleasesResponse>('getReleaseGroupReleases', {
                    body: { releaseGroupId },
                }),
            getNewReleases: async () =>
                await apiClient.request<NewReleasesResponse>('getNewReleases', { method: 'GET' }),
            removeNewReleases: async (releaseIds: string[]) =>
                await apiClient.requestText('removeNewReleases', {
                    body: await apiClient.withSourcePushToken({ releaseIds }),
                }),
            waitForTaskResult: async <T,>(taskId: string, options?: Parameters<typeof apiClient.waitForTaskResultById<T>>[1]) =>
                await apiClient.waitForTaskResultById<T>(taskId, options),
        };
    }, [apiClient]);
}
