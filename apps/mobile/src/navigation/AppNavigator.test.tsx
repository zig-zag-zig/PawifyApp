import { act, render } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  useAuthMock,
  useContentReadyMock,
  useGlobalSpinnerMock,
} = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useContentReadyMock: vi.fn(),
  useGlobalSpinnerMock: vi.fn(),
}));

vi.mock('react-native', () => ({
  StyleSheet: { create: (styles: Record<string, unknown>) => styles },
  View: () => null,
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: useAuthMock,
}));

vi.mock('../hooks/useContentReady', () => ({
  useContentReady: useContentReadyMock,
}));

vi.mock('../contexts/GlobalSpinnerContext', () => ({
  useGlobalSpinner: useGlobalSpinnerMock,
}));

vi.mock('../hooks/useNotificationService', () => ({
  useNotificationService: vi.fn(),
}));

vi.mock('../hooks/useE2eNotificationTestTrigger', () => ({
  useE2eNotificationTestTrigger: vi.fn(),
}));

vi.mock('../features/updates/hooks/useStartupUpdateCheck', () => ({
  useStartupUpdateCheck: vi.fn(),
}));

vi.mock('./AuthStack', () => ({
  AuthStack: () => null,
}));

vi.mock('./MainStack', () => ({
  MainStack: () => null,
}));

vi.mock('./navigationRef', () => ({
  navigationRef: {
    navigate: vi.fn(),
    isReady: vi.fn(() => true),
    addListener: vi.fn(() => vi.fn()),
  },
  runWhenNavigationReady: (navigate: () => void) => navigate(),
}));

vi.mock('expo-linking', () => ({
  openURL: vi.fn(async () => {}),
  createURL: vi.fn(),
}));

import { AppNavigator } from './AppNavigator';
import {
  navigateToReleaseFromNotification,
  prepareReleaseNotificationNavigation,
} from '../services/notifications/notificationNavigation';

const latestSpinnerState = () =>
  useGlobalSpinnerMock.mock.calls[useGlobalSpinnerMock.mock.calls.length - 1][0];

describe('AppNavigator notification navigation spinner', () => {
  beforeEach(() => {
    useGlobalSpinnerMock.mockClear();
    useAuthMock.mockReturnValue({ user: { id: 'user-1' }, authCompleted: true });
    useContentReadyMock.mockReturnValue({
      isWaitingForContent: false,
      onContentReady: vi.fn(),
    });
  });

  it('keeps the global spinner active while a release navigation is pending', () => {
    render(React.createElement(AppNavigator));

    expect(latestSpinnerState()).toBe(false);

    act(() => {
      prepareReleaseNotificationNavigation('releases', { releaseId: 'release-1' });
    });
    expect(latestSpinnerState()).toBe(true);

    act(() => {
      navigateToReleaseFromNotification('release-1');
    });
    expect(latestSpinnerState()).toBe(false);
  });

  it('does not activate the spinner for a digest notification', () => {
    render(React.createElement(AppNavigator));

    act(() => {
      prepareReleaseNotificationNavigation('releases', undefined);
    });

    expect(latestSpinnerState()).toBe(false);
  });
});