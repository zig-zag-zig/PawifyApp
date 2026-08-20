import { useMemo } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useApiClient } from '../../../hooks/useApiClient';
import type { FollowingResponse } from '../../../types/apiTypes';

export function useArtistsApi() {
    const { getAccessToken } = useAuth();
    const apiClient = useApiClient(getAccessToken);

    return useMemo(() => ({
        unfollowArtists: async (artistIds: string[]) =>
            await apiClient.requestText('unfollowArtists', {
                body: await apiClient.withSourcePushToken({ artistIds }),
            }),
        getFollowing: async () =>
            await apiClient.request<FollowingResponse>('getFollowing', { method: 'GET' }),
        waitForTaskResult: async <T,>(taskId: string, options?: Parameters<typeof apiClient.waitForTaskResultById<T>>[1]) =>
            await apiClient.waitForTaskResultById<T>(taskId, options),
    }), [apiClient]);
}
