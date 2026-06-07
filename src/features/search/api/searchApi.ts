import { useMemo } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useApiClient } from '../../../hooks/useApiClient';
import type {
    SearchArtistsResponse,
    TaskResultResponse,
} from '../../../types/apiTypes';

export function useSearchApi() {
    const { getAccessToken } = useAuth();
    const apiClient = useApiClient(getAccessToken);

    return useMemo(() => {
        const getTaskResult = async <T,>(taskId: string) =>
            await apiClient.request<TaskResultResponse<T>>('getTaskResult', {
                body: { taskId },
            });

        return {
            searchArtists: async (query: string, limit: number, offset = 0) =>
                await apiClient.request<SearchArtistsResponse>('searchArtists', {
                    body: { query, offset, limit },
                }),
            waitForTaskResult: async <T,>(taskId: string, options?: Parameters<typeof apiClient.waitForTaskResult<T>>[2]) =>
                await apiClient.waitForTaskResult<T>(taskId, getTaskResult, options),
        };
    }, [apiClient]);
}
