// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getLastResponseMock,
  extractEventDataMock,
  prepareNavigationMock,
  openNavigationMock,
} = vi.hoisted(() => ({
  getLastResponseMock: vi.fn(),
  extractEventDataMock: vi.fn(),
  prepareNavigationMock: vi.fn(),
  openNavigationMock: vi.fn(async () => {}),
}));

vi.mock('expo-device', () => ({
  osName: 'Android',
}));

vi.mock('expo-notifications', () => ({
  setNotificationHandler: vi.fn(),
  setNotificationChannelAsync: vi.fn(async () => {}),
  AndroidImportance: { MAX: 5 },
  registerTaskAsync: vi.fn(async () => {}),
  addNotificationReceivedListener: vi.fn(() => ({ remove: vi.fn() })),
  addNotificationsDroppedListener: vi.fn(() => ({ remove: vi.fn() })),
  addNotificationResponseReceivedListener: vi.fn(() => ({ remove: vi.fn() })),
  getLastNotificationResponse: getLastResponseMock,
}));

vi.mock('react-native', () => ({
  AppState: {
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  },
  Platform: { OS: 'android' },
}));

vi.mock('../services/externalNavigation', () => ({
  getExternalNavigationResumeDelayMs: vi.fn(() => 0),
}));

vi.mock('../services/monitoring/reportError', () => ({
  captureAppError: vi.fn(),
}));

vi.mock('../services/backgroundEventStorage', () => ({
  takePendingBackgroundEvents: vi.fn(async () => []),
}));

vi.mock('../services/notifications/notificationEvents', () => ({
  extractNotificationEventData: extractEventDataMock,
  registerNotificationEvent: vi.fn(),
}));

vi.mock('../services/notifications/notificationBackgroundTask', () => ({
  BACKGROUND_NOTIFICATION_TASK: 'background-notification-task',
  defineBackgroundNotificationTask: vi.fn(),
}));

vi.mock('../services/notifications/notificationNavigation', () => ({
  prepareReleaseNotificationNavigation: prepareNavigationMock,
  openNotificationNavigation: openNavigationMock,
}));

import { useNotificationService } from './useNotificationService';

const killedReleaseResponse = {
  notification: {
    request: {
      content: {
        title: 'New release',
        body: 'By Aurora',
        data: {},
      },
    },
  },
};

describe('useNotificationService cold-start notification navigation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('marks the release navigation pending before the deferred navigate runs', async () => {
    const eventData = { eventName: 'releases', payload: { releaseId: 'release-1' } };
    extractEventDataMock.mockReturnValue(eventData);
    getLastResponseMock.mockReturnValue(killedReleaseResponse);

    renderHook(() => useNotificationService({ enabled: true }));

    expect(prepareNavigationMock).toHaveBeenCalledWith('releases', { releaseId: 'release-1' });
    expect(openNavigationMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(openNavigationMock).toHaveBeenCalledWith('releases', { releaseId: 'release-1' });
  });

  it('does not prepare navigation when the notification has no visible content', () => {
    getLastResponseMock.mockReturnValue({
      notification: { request: { content: { title: null, body: null, data: {} } } },
    });

    renderHook(() => useNotificationService({ enabled: true }));

    expect(prepareNavigationMock).not.toHaveBeenCalled();
    expect(openNavigationMock).not.toHaveBeenCalled();
  });
});