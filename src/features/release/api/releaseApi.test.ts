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

    it('waitForTaskResult delegates to apiClient.waitForTaskResult', async () => {
        const taskResult = { taskId: 't1', type: 'test', status: 'completed', createdAt: '' };
        vi.mocked(mockApiClient.waitForTaskResult).mockResolvedValueOnce(taskResult);

        const { result } = renderHook(() => useReleaseApi());
        const output = await result.current.waitForTaskResult('t1');

        expect(mockApiClient.waitForTaskResult).toHaveBeenCalledWith('t1', expect.any(Function), undefined);
        expect(output).toBe(taskResult);
    });
});
