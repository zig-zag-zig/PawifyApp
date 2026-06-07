import { describe, expect, it, vi } from 'vitest';

vi.mock('../../config/env', () => ({
  ENV: {
    apiBaseUrl: 'https://api.example.test/',
    apiVersion: 'v1',
  },
}));

vi.mock('../../utils/diagnostics', () => ({
  describeError: vi.fn(() => ({})),
  describeIds: vi.fn(() => ({})),
  describeValueShape: vi.fn(() => ({})),
  diagnosticError: vi.fn(),
  diagnosticLog: vi.fn(),
  diagnosticWarn: vi.fn(),
  elapsedSince: vi.fn(() => 1),
}));

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
