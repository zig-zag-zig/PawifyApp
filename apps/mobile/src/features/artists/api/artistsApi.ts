import { useMemo } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useApiClient } from '../../../hooks/useApiClient';
import type {
    FollowingResponse,
    ResolveFollowingArtistImagesResponse,
} from '../../../types/apiTypes';

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
        resolveFollowingArtistImages: async (artistIds: string[]) =>
            await apiClient.request<ResolveFollowingArtistImagesResponse>(
                'resolveFollowingArtistImages',
                { body: { artistIds } }
            ),
waitForTaskResultById: apiClient.waitForTaskResultById,
    }), [apiClient]);
}
