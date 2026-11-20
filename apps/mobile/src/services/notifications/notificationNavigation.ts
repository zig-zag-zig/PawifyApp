import * as Linking from 'expo-linking';
import { navigationRef, runWhenNavigationReady } from '../../navigation/navigationRef';
import { captureAppError } from '../monitoring/reportError';
import type { EventPayload } from '../eventService';
import {
  extractReleaseIdFromEventPayload,
  getDeepLinkPathForEvent,
} from './notificationEventParsing';

type PendingNavigationListener = () => void;

let pendingReleaseNavigation = false;
const pendingNavigationListeners = new Set<PendingNavigationListener>();

const setPendingReleaseNavigation = (isPending: boolean): void => {
  if (pendingReleaseNavigation === isPending) {
    return;
  }

  pendingReleaseNavigation = isPending;
  pendingNavigationListeners.forEach(listener => listener());
};

export const getPendingReleaseNavigation = (): boolean => pendingReleaseNavigation;

/**
 * Clears the notification-navigation spinner once the destination screen has
 * content. Digest notifications land on the Releases tab, whose list may still
 * be loading after the tab mounts.
 */
export const finishReleaseNotificationNavigation = (): void => {
  setPendingReleaseNavigation(false);
};

export const subscribeToPendingReleaseNavigation = (
  listener: PendingNavigationListener,
): (() => void) => {
  pendingNavigationListeners.add(listener);
  return () => {
    pendingNavigationListeners.delete(listener);
  };
};

/**
 * Marks a notification-triggered release navigation as pending before the
 * actual navigate call. Cold-start taps defer navigation until the navigator
 * mounts, so this keeps the app spinner covering the default tab during that
 * gap instead of briefly flashing the search screen.
 */
export const prepareReleaseNotificationNavigation = (
  eventName: string,
  _payload: EventPayload | undefined,
): void => {
  // Single-release and digest notifications both start on the Releases tab.
  // Keep the startup spinner up until that destination has content so the
  // default Search tab never paints for a frame.
  if (eventName === 'releases') {
    setPendingReleaseNavigation(true);
  }
};

/**
 * Opens the release page for a notification-tapped release. The Releases tab
 * is selected first so hardware/gesture back from the release page lands on
 * the new-releases list instead of whatever screen/tab was previously open
 * (or exiting the app after a cold start).
 */
export const navigateToReleaseFromNotification = (releaseId: string): void => {
  setPendingReleaseNavigation(true);

  runWhenNavigationReady(() => {
    try {
      navigationRef.navigate('Home', { screen: 'Releases' });
      navigationRef.navigate('Release', { releaseId });
    } catch (error) {
      console.error('fcm: navigate to release failed', { releaseId, error });
      captureAppError(error, { scope: 'fcm', action: 'navigate-to-release', releaseId });
    } finally {
      // The release page starts its own loading spinner on mount; let it take
      // over so the shared spinner never drops before content is on screen.
      setPendingReleaseNavigation(false);
    }
  });
};

const openDeepLink = async (path: string): Promise<void> => {
  try {
    await Linking.openURL(Linking.createURL(path));
  } catch (error) {
    console.error('fcm: open deep link failed', { path, error });
    captureAppError(error, { scope: 'fcm', action: 'open-deep-link', path });
  }
};

/**
 * Navigates for a notification tap. A new-release notification carrying a
 * release id goes straight to that release's page; everything else falls
 * back to the tab deep link for its event.
 */
export const openNotificationNavigation = async (
  eventName: string,
  payload: EventPayload | undefined,
): Promise<void> => {
  if (eventName === 'releases') {
    const releaseId = extractReleaseIdFromEventPayload(payload);
    if (releaseId) {
      navigateToReleaseFromNotification(releaseId);
      return;
    }

    // Digest: keep the spinner up while the Releases tab mounts and loads its
    // list. ReleasesPage clears it once the feed has loaded.
    setPendingReleaseNavigation(true);
  }

  const path = getDeepLinkPathForEvent(eventName);
  if (path) {
    await openDeepLink(path);
    if (eventName === 'releases') {
      // Safety net for a failed/slow deep link; the Releases page normally
      // clears this as soon as its list is ready.
      setTimeout(() => {
        finishReleaseNotificationNavigation();
      }, 8000);
    }
  }
};
