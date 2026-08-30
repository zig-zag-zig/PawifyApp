import { beforeEach, describe, expect, it, vi } from 'vitest';

const { navigationRefMock, openURLMock, createURLMock, runWhenReadyMock } = vi.hoisted(() => ({
  navigationRefMock: {
    navigate: vi.fn(),
    isReady: vi.fn(() => true),
    addListener: vi.fn(() => vi.fn()),
  },
  openURLMock: vi.fn(async () => {}),
  createURLMock: vi.fn((path: string) => `pawify://${path}`),
  runWhenReadyMock: vi.fn((navigate: () => void) => navigate()),
}));

vi.mock('../../navigation/navigationRef', () => ({
  navigationRef: navigationRefMock,
  runWhenNavigationReady: runWhenReadyMock,
}));

vi.mock('expo-linking', () => ({
  openURL: openURLMock,
  createURL: createURLMock,
}));

import {
  navigateToReleaseFromNotification,
  openNotificationNavigation,
} from './notificationNavigation';

describe('navigateToReleaseFromNotification', () => {
  beforeEach(() => {
    navigationRefMock.navigate.mockClear();
    openURLMock.mockClear();
  });

  it('selects the Releases tab before pushing the release page', () => {
    navigateToReleaseFromNotification('release-42');

    expect(navigationRefMock.navigate.mock.calls).toEqual([
      ['Home', { screen: 'Releases' }],
      ['Release', { releaseId: 'release-42' }],
    ]);
    expect(openURLMock).not.toHaveBeenCalled();
  });

  it('defers through runWhenNavigationReady so cold starts wait for the navigator', () => {
    runWhenReadyMock.mockImplementationOnce(() => undefined);

    navigateToReleaseFromNotification('release-42');

    expect(navigationRefMock.navigate).not.toHaveBeenCalled();
  });

  it('does not throw when navigation fails', () => {
    navigationRefMock.navigate.mockImplementationOnce(() => {
      throw new Error('not handled');
    });

    expect(() => navigateToReleaseFromNotification('release-42')).not.toThrow();
  });
});

describe('openNotificationNavigation', () => {
  beforeEach(() => {
    navigationRefMock.navigate.mockClear();
    openURLMock.mockClear();
    createURLMock.mockClear();
  });

  it('opens the release page when a releases event carries a releaseId', async () => {
    await openNotificationNavigation('releases', { releaseId: 'release-7' });

    expect(navigationRefMock.navigate.mock.calls).toEqual([
      ['Home', { screen: 'Releases' }],
      ['Release', { releaseId: 'release-7' }],
    ]);
    expect(openURLMock).not.toHaveBeenCalled();
  });

  it('falls back to the releases tab when the payload has no releaseId', async () => {
    await openNotificationNavigation('releases', undefined);

    expect(navigationRefMock.navigate).not.toHaveBeenCalled();
    expect(openURLMock).toHaveBeenCalledWith('pawify:///releases');
  });

  it('falls back to the tab deep link for other data events', async () => {
    await openNotificationNavigation('following', { artistId: 'artist-1' });

    expect(openURLMock).toHaveBeenCalledWith('pawify:///artists');
    expect(navigationRefMock.navigate).not.toHaveBeenCalled();
  });

  it('ignores release ids on non-releases events', async () => {
    await openNotificationNavigation('following', { releaseId: 'release-7' });

    // Still routes by event name; release navigation is releases-only.
    expect(openURLMock).toHaveBeenCalledWith('pawify:///artists');
    expect(navigationRefMock.navigate).not.toHaveBeenCalled();
  });

  it('does nothing for events without a deep link', async () => {
    await openNotificationNavigation('taskCompleted:task-1', { taskId: 'task-1' });
    await openNotificationNavigation('somethingNew', undefined);

    expect(openURLMock).not.toHaveBeenCalled();
    expect(navigationRefMock.navigate).not.toHaveBeenCalled();
  });
});
