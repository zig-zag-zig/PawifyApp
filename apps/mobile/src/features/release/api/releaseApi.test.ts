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

import { useReleaseApi } from './releaseApi';

describe('useReleaseApi', () => {
    it('getRelease calls apiClient.request with correct endpoint', async () => {
        const mockResult = { release: { id: 'r1' } };
        vi.mocked(mockApiClient.request).mockResolvedValueOnce(mockResult);

        const { result } = renderHook(() => useReleaseApi());
        const output = await result.current.getRelease('r1');

        expect(mockApiClient.request).toHaveBeenCalledWith('getRelease', {
            body: { releaseId: 'r1' },
        });
        expect(output).toBe(mockResult);
    });

    it('getReleaseGroupReleases calls apiClient.request with correct endpoint', async () => {
        const mockResult = { releases: [] };
        vi.mocked(mockApiClient.request).mockResolvedValueOnce(mockResult);

        const { result } = renderHook(() => useReleaseApi());
        const output = await result.current.getReleaseGroupReleases('rg-1');

        expect(mockApiClient.request).toHaveBeenCalledWith('getReleaseGroupReleases', {
            body: { releaseGroupId: 'rg-1' },
        });
        expect(output).toBe(mockResult);
    });

    it('waitForTaskResultById delegates to apiClient.waitForTaskResultById', async () => {
        const taskResult = { taskId: 't1', type: 'test', status: 'completed', createdAt: '' };
        vi.mocked(mockApiClient.waitForTaskResultById).mockResolvedValueOnce(taskResult);

        const { result } = renderHook(() => useReleaseApi());
        const output = await result.current.waitForTaskResultById('t1');

        expect(mockApiClient.waitForTaskResultById).toHaveBeenCalledWith('t1');
        expect(output).toBe(taskResult);
    });

    it('getNewReleases calls apiClient.request with correct endpoint', async () => {
        const mockResult = { releases: [], releaseCoverTaskId: 'cover-1' };
        vi.mocked(mockApiClient.request).mockResolvedValueOnce(mockResult);

        const { result } = renderHook(() => useReleaseApi());
        const output = await result.current.getNewReleases();

        expect(mockApiClient.request).toHaveBeenCalledWith('getNewReleases', {
            method: 'GET',
        });
        expect(output).toBe(mockResult);
    });

    it('removeNewReleases calls apiClient.requestText with source push token', async () => {
        vi.mocked(mockApiClient.withSourcePushToken).mockResolvedValueOnce({ releaseIds: ['r1'], sourcePushToken: 'push-1' });
        vi.mocked(mockApiClient.requestText).mockResolvedValueOnce('ok');

        const { result } = renderHook(() => useReleaseApi());
        const output = await result.current.removeNewReleases(['r1']);

        expect(mockApiClient.withSourcePushToken).toHaveBeenCalledWith({ releaseIds: ['r1'] });
        expect(mockApiClient.requestText).toHaveBeenCalledWith('removeNewReleases', {
            body: { releaseIds: ['r1'], sourcePushToken: 'push-1' },
        });
        expect(output).toBe('ok');
    });
});
