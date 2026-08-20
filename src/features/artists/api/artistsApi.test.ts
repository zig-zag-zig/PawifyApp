// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import React from 'react';

vi.mock('../../../contexts/AuthContext', () => ({
    useAuth: () => ({ getAccessToken: vi.fn(async () => 'token') }),
}));

const mockApiClient = {
    request: vi.fn(),
    requestText: vi.fn(),
    withSourcePushToken: vi.fn(),
    waitForTaskResult: vi.fn(),
    waitForTaskResultById: vi.fn(),
};

vi.mock('../../../hooks/useApiClient', () => ({
    useApiClient: () => mockApiClient,
}));

import { useArtistsApi } from './artistsApi';

describe('useArtistsApi', () => {
    it('unfollowArtists calls apiClient.requestText with source push token', async () => {
        vi.mocked(mockApiClient.withSourcePushToken).mockResolvedValueOnce({ artistIds: ['a1', 'a2'], sourcePushToken: 'push-1' });
        vi.mocked(mockApiClient.requestText).mockResolvedValueOnce('ok');

        const { result } = renderHook(() => useArtistsApi());
        const output = await result.current.unfollowArtists(['a1', 'a2']);

        expect(mockApiClient.withSourcePushToken).toHaveBeenCalledWith({ artistIds: ['a1', 'a2'] });
        expect(mockApiClient.requestText).toHaveBeenCalledWith('unfollowArtists', {
            body: { artistIds: ['a1', 'a2'], sourcePushToken: 'push-1' },
        });
        expect(output).toBe('ok');
    });

    it('getFollowing calls apiClient.request with correct endpoint', async () => {
        const mockResult = { artists: [{ id: 'a1', name: 'A1', imageUrl: null }], profileImageTaskId: 'img-1' };
        vi.mocked(mockApiClient.request).mockResolvedValueOnce(mockResult);

        const { result } = renderHook(() => useArtistsApi());
        const output = await result.current.getFollowing();

        expect(mockApiClient.request).toHaveBeenCalledWith('getFollowing', {
            method: 'GET',
        });
        expect(output).toBe(mockResult);
    });

    it('waitForTaskResultById delegates to apiClient.waitForTaskResultById', async () => {
        const taskResult = { taskId: 't1', type: 'test', status: 'completed', createdAt: '' };
        vi.mocked(mockApiClient.waitForTaskResultById).mockResolvedValueOnce(taskResult);

        const { result } = renderHook(() => useArtistsApi());
        const output = await result.current.waitForTaskResultById('t1');

        expect(mockApiClient.waitForTaskResultById).toHaveBeenCalledWith('t1');
        expect(output).toBe(taskResult);
    });
});
