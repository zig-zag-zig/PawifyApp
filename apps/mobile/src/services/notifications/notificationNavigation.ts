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
  payload: EventPayload | undefined,
): void => {
  if (eventName === 'releases' && extractReleaseIdFromEventPayload(payload)) {
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
  }

  const path = getDeepLinkPathForEvent(eventName);
  if (path) {
    await openDeepLink(path);
  }
};
