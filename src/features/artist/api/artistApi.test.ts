// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import React from 'react';

vi.mock('../../../contexts/AuthContext', () => ({
    useAuth: () => ({ getAccessToken: vi.fn(async () => 'token') }),
}));

const mockApiClient = {
    request: vi.fn(),
    withSourcePushToken: vi.fn(),
    waitForTaskResult: vi.fn(),
};

vi.mock('../../../hooks/useApiClient', () => ({
    useApiClient: () => mockApiClient,
}));

import { useArtistApi } from './artistApi';

describe('useArtistApi', () => {
    it('getArtistDetails calls apiClient.request with correct endpoint', async () => {
        const mockResult = { artist: { id: 'a1' } };
        vi.mocked(mockApiClient.request).mockResolvedValueOnce(mockResult);

        const { result } = renderHook(() => useArtistApi());
        const output = await result.current.getArtistDetails('a1');

        expect(mockApiClient.request).toHaveBeenCalledWith('getArtistDetails', {
            body: { artistId: 'a1' },
        });
        expect(output).toBe(mockResult);
    });

    it('getArtistReleases calls apiClient.request with correct endpoint', async () => {
        const mockResult = { releaseGroups: [] };
        vi.mocked(mockApiClient.request).mockResolvedValueOnce(mockResult);

        const { result } = renderHook(() => useArtistApi());
        const output = await result.current.getArtistReleases('a1');

        expect(mockApiClient.request).toHaveBeenCalledWith('getArtistReleases', {
            body: { artistId: 'a1' },
        });
        expect(output).toBe(mockResult);
    });

    it('followArtist calls apiClient.request with source push token', async () => {
        vi.mocked(mockApiClient.withSourcePushToken).mockResolvedValueOnce({ artistId: 'a1', sourcePushToken: 'push-1' });
        vi.mocked(mockApiClient.request).mockResolvedValueOnce('ok');

        const { result } = renderHook(() => useArtistApi());
        const output = await result.current.followArtist('a1');

        expect(mockApiClient.withSourcePushToken).toHaveBeenCalledWith({ artistId: 'a1' });
        expect(mockApiClient.request).toHaveBeenCalledWith('followArtist', {
            body: { artistId: 'a1', sourcePushToken: 'push-1' },
        });
        expect(output).toBe('ok');
    });

    it('unfollowArtist calls apiClient.request with source push token', async () => {
        vi.mocked(mockApiClient.withSourcePushToken).mockResolvedValueOnce({ artistId: 'a1', sourcePushToken: 'push-1' });
        vi.mocked(mockApiClient.request).mockResolvedValueOnce('ok');

        const { result } = renderHook(() => useArtistApi());
        const output = await result.current.unfollowArtist('a1');

        expect(mockApiClient.request).toHaveBeenCalledWith('unfollowArtist', {
            body: { artistId: 'a1', sourcePushToken: 'push-1' },
        });
        expect(output).toBe('ok');
    });

    it('getReleaseGroupReleases calls apiClient.request with correct endpoint', async () => {
        const mockResult = { releases: [] };
        vi.mocked(mockApiClient.request).mockResolvedValueOnce(mockResult);

        const { result } = renderHook(() => useArtistApi());
        const output = await result.current.getReleaseGroupReleases('rg-1');

        expect(mockApiClient.request).toHaveBeenCalledWith('getReleaseGroupReleases', {
            body: { releaseGroupId: 'rg-1' },
        });
        expect(output).toBe(mockResult);
    });

    it('waitForTaskResult delegates to apiClient.waitForTaskResult', async () => {
        const taskResult = { taskId: 't1', type: 'test', status: 'completed', createdAt: '' };
        vi.mocked(mockApiClient.waitForTaskResult).mockResolvedValueOnce(taskResult);

        const { result } = renderHook(() => useArtistApi());
        const output = await result.current.waitForTaskResult('t1');

        expect(mockApiClient.waitForTaskResult).toHaveBeenCalledWith('t1', expect.any(Function), undefined);
        expect(output).toBe(taskResult);
    });
});
