import { useMemo } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useApiClient } from '../../../hooks/useApiClient';
import type {
    ArtistDetailsResponse,
    ArtistReleasesResponse,
    ReleaseGroupReleasesResponse,
} from '../../../types/apiTypes';

export function useArtistApi() {
    const { getAccessToken } = useAuth();
    const apiClient = useApiClient(getAccessToken);

    return useMemo(() => {
        return {
            followArtist: async (artistId: string) =>
                await apiClient.request<string>('followArtist', {
                    body: await apiClient.withSourcePushToken({ artistId }),
                }),
            unfollowArtist: async (artistId: string) =>
                await apiClient.request<string>('unfollowArtist', {
                    body: await apiClient.withSourcePushToken({ artistId }),
                }),
            getArtistDetails: async (artistId: string) =>
                await apiClient.request<ArtistDetailsResponse>('getArtistDetails', {
                    body: { artistId },
                }),
            getArtistReleases: async (artistId: string) =>
                await apiClient.request<ArtistReleasesResponse>('getArtistReleases', {
                    body: { artistId },
                }),
            getReleaseGroupReleases: async (releaseGroupId: string) =>
                await apiClient.request<ReleaseGroupReleasesResponse>('getReleaseGroupReleases', {
                    body: { releaseGroupId },
                }),
            waitForTaskResult: async <T,>(taskId: string, options?: Parameters<typeof apiClient.waitForTaskResultById<T>>[1]) =>
                await apiClient.waitForTaskResultById<T>(taskId, options),
        };
    }, [apiClient]);
}
