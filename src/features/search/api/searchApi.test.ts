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

import { useSearchApi } from './searchApi';

describe('useSearchApi', () => {
    it('searchArtists calls apiClient.request with correct endpoint and body', async () => {
        const mockResult = { artists: [], total: 0 };
        vi.mocked(mockApiClient.request).mockResolvedValueOnce(mockResult);

        const { result } = renderHook(() => useSearchApi());

        const output = await result.current.searchArtists('twin peaks', 10, 0);

        expect(mockApiClient.request).toHaveBeenCalledWith('searchArtists', {
            body: { query: 'twin peaks', offset: 0, limit: 10 },
        });
        expect(output).toBe(mockResult);
    });

    it('searchArtists defaults offset to 0', async () => {
        vi.mocked(mockApiClient.request).mockResolvedValueOnce({ artists: [], total: 0 });

        const { result } = renderHook(() => useSearchApi());
        await result.current.searchArtists('query', 5);

        expect(mockApiClient.request).toHaveBeenCalledWith('searchArtists', {
            body: { query: 'query', offset: 0, limit: 5 },
        });
    });

    it('waitForTaskResult delegates to apiClient.waitForTaskResult', async () => {
        const taskResult = { taskId: 't1', type: 'test', status: 'completed', createdAt: '' };
        vi.mocked(mockApiClient.waitForTaskResult).mockResolvedValueOnce(taskResult);

        const { result } = renderHook(() => useSearchApi());
        const output = await result.current.waitForTaskResult('t1');

        expect(mockApiClient.waitForTaskResult).toHaveBeenCalledWith('t1', expect.any(Function), undefined);
        expect(output).toBe(taskResult);
    });
});
