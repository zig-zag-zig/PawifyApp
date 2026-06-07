import { useMemo } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useApiClient } from '../../../hooks/useApiClient';
import type {
    ReleaseGroupReleasesResponse,
    ReleaseResponse,
    TaskResultResponse,
} from '../../../types/apiTypes';

export function useReleaseApi() {
    const { getAccessToken } = useAuth();
    const apiClient = useApiClient(getAccessToken);

    return useMemo(() => {
        const getTaskResult = async <T,>(taskId: string) =>
            await apiClient.request<TaskResultResponse<T>>('getTaskResult', {
                body: { taskId },
            });

        return {
            getRelease: async (releaseId: string) =>
                await apiClient.request<ReleaseResponse>('getRelease', {
                    body: { releaseId },
                }),
            getReleaseGroupReleases: async (releaseGroupId: string) =>
                await apiClient.request<ReleaseGroupReleasesResponse>('getReleaseGroupReleases', {
                    body: { releaseGroupId },
                }),
            waitForTaskResult: async <T,>(taskId: string, options?: Parameters<typeof apiClient.waitForTaskResult<T>>[2]) =>
                await apiClient.waitForTaskResult<T>(taskId, getTaskResult, options),
        };
    }, [apiClient]);
}
