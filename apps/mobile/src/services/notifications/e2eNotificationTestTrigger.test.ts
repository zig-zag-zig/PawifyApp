import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getPermissionsMock, requestPermissionsMock, scheduleMock } = vi.hoisted(() => ({
  getPermissionsMock: vi.fn(async () => ({ status: 'granted' })),
  requestPermissionsMock: vi.fn(async () => ({ status: 'granted' })),
  scheduleMock: vi.fn(async () => 'notification-id'),
}));

vi.mock('expo-notifications', () => ({
  getPermissionsAsync: getPermissionsMock,
  requestPermissionsAsync: requestPermissionsMock,
  scheduleNotificationAsync: scheduleMock,
}));

import {
  parseE2eReleaseNotificationUrl,
  postE2eReleaseNotification,
} from './e2eNotificationTestTrigger';

const triggerUrl = (
  releaseId: string,
  extra: Record<string, string> = {},
) => `pawify://e2e/release-notification?releaseId=${encodeURIComponent(releaseId)}${
  Object.entries(extra)
    .map(([key, value]) => `&${key}=${encodeURIComponent(value)}`)
    .join('')
}`;

describe('parseE2eReleaseNotificationUrl', () => {
  it('parses release id, title, and body query params', () => {
    expect(
      parseE2eReleaseNotificationUrl(
        triggerUrl('release-1', { title: 'Midnight Signals', body: 'By Aurora' }),
      ),
    ).toEqual({
      releaseId: 'release-1',
      title: 'Midnight Signals',
      body: 'By Aurora',
    });
  });

  it('defaults the title and body when not provided', () => {
    expect(parseE2eReleaseNotificationUrl(triggerUrl('release-1'))).toEqual({
      releaseId: 'release-1',
      title: 'New release',
      body: '',
    });
  });

  it('accepts semicolon-separated parameters (shell-safe separator)', () => {
    expect(
      parseE2eReleaseNotificationUrl(
        'pawify://e2e/release-notification?releaseId=release-9;title=Ghost%20Release;body=By%20Nobody',
      ),
    ).toEqual({
      releaseId: 'release-9',
      title: 'Ghost Release',
      body: 'By Nobody',
    });
  });

  it('rejects urls outside the e2e release-notification path', () => {
    expect(parseE2eReleaseNotificationUrl('pawify://release/release-1')).toBeNull();
    expect(parseE2eReleaseNotificationUrl('pawify://e2e/other-trigger?releaseId=r')).toBeNull();
    expect(parseE2eReleaseNotificationUrl('pawify://e2e/release-notification/extra')).toBeNull();
  });

  it('rejects urls without a release id or with a blank one', () => {
    expect(parseE2eReleaseNotificationUrl('pawify://e2e/release-notification')).toBeNull();
    expect(parseE2eReleaseNotificationUrl('pawify://e2e/release-notification?releaseId=%20%20')).toBeNull();
  });

  it('rejects null, non-link, and fragment-bearing-but-invalid urls', () => {
    expect(parseE2eReleaseNotificationUrl(null)).toBeNull();
    expect(parseE2eReleaseNotificationUrl('not-a-url')).toBeNull();
    expect(parseE2eReleaseNotificationUrl(undefined)).toBeNull();
  });
});

describe('postE2eReleaseNotification', () => {
  beforeEach(() => {
    scheduleMock.mockClear();
    requestPermissionsMock.mockClear();
    getPermissionsMock.mockClear();
  });

  it('schedules a local notification with the backend push payload shape', async () => {
    await expect(
      postE2eReleaseNotification({
        releaseId: 'release-1',
        title: 'Midnight Signals',
        body: 'By Aurora Test Ensemble',
      }),
    ).resolves.toBe(true);

    expect(scheduleMock).toHaveBeenCalledTimes(1);
    expect(scheduleMock).toHaveBeenCalledWith({
      content: {
        title: 'Midnight Signals',
        body: 'By Aurora Test Ensemble',
        data: {
          eventName: 'releases',
          payload: { releaseId: 'release-1' },
        },
      },
      trigger: null,
    });
    expect(requestPermissionsMock).not.toHaveBeenCalled();
  });

  it('requests permission first when it is not already granted', async () => {
    getPermissionsMock.mockResolvedValueOnce({ status: 'undetermined' });

    await expect(
      postE2eReleaseNotification({ releaseId: 'release-1', title: 'T', body: 'B' }),
    ).resolves.toBe(true);

    expect(requestPermissionsMock).toHaveBeenCalledTimes(1);
  });

  it('does not schedule when permission is denied', async () => {
    getPermissionsMock.mockResolvedValueOnce({ status: 'denied' });
    requestPermissionsMock.mockResolvedValueOnce({ status: 'denied' });

    await expect(
      postE2eReleaseNotification({ releaseId: 'release-1', title: 'T', body: 'B' }),
    ).resolves.toBe(false);

    expect(scheduleMock).not.toHaveBeenCalled();
  });
});
