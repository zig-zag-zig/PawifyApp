import { describe, expect, it, vi } from 'vitest';
import { mockDiagnostics } from '../../test/mocks';

vi.mock('../../config/env', () => ({
  ENV: {
    apiBaseUrl: 'https://api.example.test/',
    apiVersion: 'v1',
  },
}));

vi.mock('../../utils/diagnostics', () => mockDiagnostics());

vi.mock('../taskResultWaiter', () => ({
  waitForTaskResultFromSignals: vi.fn(),
}));

import { buildApiUrl, createApiClient } from './apiClient';

function createResponse(status: number, data: unknown): Response {
  const text = typeof data === 'string' ? data : JSON.stringify(data);
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(async () => {
      if (typeof data === 'string') {
        throw new Error('not json');
      }
      return data;
    }),
    text: vi.fn(async () => text),
    clone: vi.fn(() => createResponse(status, data)),
  } as unknown as Response;
}

describe('apiClient', () => {
  it('builds normalized API urls', () => {
    expect(buildApiUrl('https://api.example.test', '/v2/', '/artists')).toBe(
      'https://api.example.test/v2/artists',
    );
  });

  it('sends authenticated JSON requests', async () => {
    const fetchFn = vi.fn(async () => createResponse(200, { ok: true }));
    const client = createApiClient({
      apiBaseUrl: 'https://api.example.test/',
      apiVersion: 'v1',
      fetchFn: fetchFn as typeof fetch,
      getAccessToken: async () => 'token-1',
    });

    await expect(client.request('followArtist', {
      body: { artistId: 'artist-1' },
    })).resolves.toEqual({ ok: true });

    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.example.test/v1/followArtist',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token-1',
        },
        body: JSON.stringify({ artistId: 'artist-1' }),
      },
    );
  });

  it('supports public requests without auth headers', async () => {
    const fetchFn = vi.fn(async () => createResponse(200, 'sent'));
    const client = createApiClient({
      fetchFn: fetchFn as typeof fetch,
      getAccessToken: async () => {
        throw new Error('should not be called');
      },
    });

    await expect(client.request('sendOtp', {
      body: { email: 'user@example.test' },
      requiresAuth: false,
    })).resolves.toBe('sent');

    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.example.test/v1/sendOtp',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );
  });

  it('wraps failed HTTP responses with API call errors', async () => {
    const fetchFn = vi.fn(async () => createResponse(403, { message: 'Nope' }));
    const client = createApiClient({
      fetchFn: fetchFn as typeof fetch,
      getAccessToken: async () => 'token-1',
    });

    await expect(client.request('deleteUserAccount')).rejects.toMatchObject({
      name: 'ApiCallError',
      statusCode: 403,
      userMessage: 'Nope',
    });
  });

  it('waitForTaskResultById delegates to waitForTaskResultFromSignals and request', async () => {
    const { waitForTaskResultFromSignals } = await import('../taskResultWaiter');
    vi.mocked(waitForTaskResultFromSignals).mockResolvedValueOnce({
      taskId: 'task-1',
      type: 'test-type',
      status: 'completed',
      createdAt: '2024-01-01T00:00:00Z',
      result: { data: 'ok' },
      subtaskIds: ['sub-1'],
      completedSubtaskIds: ['sub-1'],
      subtaskCount: 1,
      completedSubtaskCount: 1,
    });

    const client = createApiClient({
      fetchFn: vi.fn() as unknown as typeof fetch,
      getAccessToken: async () => 'token-1',
    });

    const result = await client.waitForTaskResultById('task-1');

    expect(waitForTaskResultFromSignals).toHaveBeenCalledWith(
      'task-1',
      expect.any(Function),
      undefined,
    );
    expect(result).toMatchObject({
      taskId: 'task-1',
      status: 'completed',
      result: { data: 'ok' },
    });
  });

  it('adds a source push token when one is available', async () => {
    const client = createApiClient({
      getAccessToken: async () => 'token-1',
      getSourcePushToken: async () => 'push-1',
    });

    await expect(client.withSourcePushToken({ artistId: 'artist-1' })).resolves.toEqual({
      artistId: 'artist-1',
      sourcePushToken: 'push-1',
    });
  });
});
