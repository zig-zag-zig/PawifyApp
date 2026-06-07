import { useMemo } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useApiClient } from '../../../hooks/useApiClient';

export function useArtistsApi() {
    const { getAccessToken } = useAuth();
    const apiClient = useApiClient(getAccessToken);

    return useMemo(() => ({
        unfollowArtists: async (artistIds: string[]) =>
            await apiClient.request<string>('unfollowArtists', {
                body: await apiClient.withSourcePushToken({ artistIds }),
            }),
    }), [apiClient]);
}
