import { useMemo } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useApiClient } from '../../../hooks/useApiClient';
import type {
    ResolveNewReleaseCoversResponse,
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
            resolveNewReleaseCovers: async (releaseIds: string[]) =>
                await apiClient.request<ResolveNewReleaseCoversResponse>(
                    'resolveNewReleaseCovers',
                    { body: { releaseIds } }
                ),
            removeNewReleases: async (releaseIds: string[]) =>
                await apiClient.requestText('removeNewReleases', {
                    body: await apiClient.withSourcePushToken({ releaseIds }),
                }),
            waitForTaskResultById: apiClient.waitForTaskResultById,
        };
    }, [apiClient]);
}
