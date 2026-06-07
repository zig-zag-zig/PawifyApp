import { useMemo } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useApiClient } from '../../../hooks/useApiClient';
import type {
    ArtistDetailsResponse,
    ArtistReleasesResponse,
    ReleaseGroupReleasesResponse,
    TaskResultResponse,
} from '../../../types/apiTypes';

export function useArtistApi() {
    const { getAccessToken } = useAuth();
    const apiClient = useApiClient(getAccessToken);

    return useMemo(() => {
        const getTaskResult = async <T,>(taskId: string) =>
            await apiClient.request<TaskResultResponse<T>>('getTaskResult', {
                body: { taskId },
            });

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
            waitForTaskResult: async <T,>(taskId: string, options?: Parameters<typeof apiClient.waitForTaskResult<T>>[2]) =>
                await apiClient.waitForTaskResult<T>(taskId, getTaskResult, options),
        };
    }, [apiClient]);
}
