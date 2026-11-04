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
                await apiClient.requestText('followArtist', {
                    body: await apiClient.withSourcePushToken({ artistId }),
                }),
            unfollowArtist: async (artistId: string) =>
                await apiClient.requestText('unfollowArtist', {
                    body: await apiClient.withSourcePushToken({ artistId }),
                }),
            getArtistDetails: async (artistId: string) =>
                await apiClient.request<ArtistDetailsResponse>('getArtistDetails', {
                    body: { artistId },
                }),
            getArtistReleases: async (
                artistId: string,
                options?: { limit?: number; cursor?: string | null },
            ) =>
                await apiClient.request<ArtistReleasesResponse>('getArtistReleases', {
                    // Omitting both keeps the old "give me everything" behaviour, which
                    // is what older servers expect.
                    body: {
                        artistId,
                        ...(options?.limit ? { limit: options.limit } : {}),
                        ...(options?.cursor ? { cursor: options.cursor } : {}),
                    },
                }),
            getReleaseGroupReleases: async (releaseGroupId: string) =>
                await apiClient.request<ReleaseGroupReleasesResponse>('getReleaseGroupReleases', {
                    body: { releaseGroupId },
                }),
            waitForTaskResultById: apiClient.waitForTaskResultById,
        };
    }, [apiClient]);
}
