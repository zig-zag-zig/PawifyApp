import { useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useApiClient } from '../hooks/useApiClient';

export type BrokenEntityImageType = 'artist' | 'release' | 'release_group';

type InvalidateResponse = { invalidated: boolean; url: string | null };

/**
 * Reports artwork URLs that stopped loading so the server can replace the mirror row.
 *
 * A session-wide set keeps a flaky connection from turning into a probe loop: each
 * entity is reported at most once per app run, and the server applies its own
 * cooldown on top of that.
 */
export function useBrokenEntityImageReporter() {
    const { getAccessToken } = useAuth();
    const apiClient = useApiClient(getAccessToken);
    const reported = useMemo(() => new Set<string>(), []);

    return useCallback(
        (entityType: BrokenEntityImageType, entityId: string) => {
            const key = `${entityType}:${entityId}`;
            if (reported.has(key)) {
                return;
            }
            reported.add(key);

            void apiClient
                .request<InvalidateResponse>('invalidateEntityImage', {
                    body: { entityType, entityId },
                })
                .catch(() => {
                    // Best effort: a failed report must never surface to the user.
                });
        },
        [apiClient, reported],
    );
}
