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
  getPendingReleaseNavigation,
  navigateToReleaseFromNotification,
  openNotificationNavigation,
  prepareReleaseNotificationNavigation,
  subscribeToPendingReleaseNavigation,
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
    let deferredNavigation: (() => void) | undefined;
    runWhenReadyMock.mockImplementationOnce((navigate: () => void) => {
      deferredNavigation = navigate;
    });

    navigateToReleaseFromNotification('release-42');

    expect(navigationRefMock.navigate).not.toHaveBeenCalled();
    expect(getPendingReleaseNavigation()).toBe(true);

    deferredNavigation?.();

    expect(navigationRefMock.navigate.mock.calls).toEqual([
      ['Home', { screen: 'Releases' }],
      ['Release', { releaseId: 'release-42' }],
    ]);
    expect(getPendingReleaseNavigation()).toBe(false);
  });

  it('marks the navigation pending as soon as it is requested', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToPendingReleaseNavigation(listener);

    navigateToReleaseFromNotification('release-42');

    expect(listener).toHaveBeenCalledTimes(2);
    expect(getPendingReleaseNavigation()).toBe(false);

    unsubscribe();
  });

  it('clears the pending spinner when navigation fails', () => {
    navigationRefMock.navigate.mockImplementationOnce(() => {
      throw new Error('not handled');
    });

    expect(() => navigateToReleaseFromNotification('release-42')).not.toThrow();
    expect(getPendingReleaseNavigation()).toBe(false);
  });

  it('pre-marks deferred release events so the default tab never paints', () => {
    prepareReleaseNotificationNavigation('releases', { releaseId: 'release-42' });

    expect(getPendingReleaseNavigation()).toBe(true);

    // The deferred navigation clears the pending state once it runs.
    navigateToReleaseFromNotification('release-42');
    expect(getPendingReleaseNavigation()).toBe(false);
  });

  it('does not pre-mark digest or non-release notifications', () => {
    prepareReleaseNotificationNavigation('releases', undefined);
    prepareReleaseNotificationNavigation('following', { releaseId: 'release-42' });

    expect(getPendingReleaseNavigation()).toBe(false);
  });

  it('only emits pending changes once per state transition', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToPendingReleaseNavigation(listener);

    prepareReleaseNotificationNavigation('releases', { releaseId: 'release-42' });
    prepareReleaseNotificationNavigation('releases', { releaseId: 'release-42' });

    expect(listener).toHaveBeenCalledTimes(1);

    navigateToReleaseFromNotification('release-42');
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
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
