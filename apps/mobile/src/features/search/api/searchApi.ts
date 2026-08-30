import { useMemo } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useApiClient } from '../../../hooks/useApiClient';
import type {
    SearchArtistsResponse,
} from '../../../types/apiTypes';

export function useSearchApi() {
    const { getAccessToken } = useAuth();
    const apiClient = useApiClient(getAccessToken);

    return useMemo(() => {
        return {
            searchArtists: async (query: string, limit: number, offset = 0) =>
                await apiClient.request<SearchArtistsResponse>('searchArtists', {
                    body: { query, offset, limit },
                }),
            waitForTaskResultById: apiClient.waitForTaskResultById,
        };
    }, [apiClient]);
}
