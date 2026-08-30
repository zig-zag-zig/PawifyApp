import * as Linking from 'expo-linking';
import { navigationRef, runWhenNavigationReady } from '../../navigation/navigationRef';
import { captureAppError } from '../monitoring/reportError';
import type { EventPayload } from '../eventService';
import {
  extractReleaseIdFromEventPayload,
  getDeepLinkPathForEvent,
} from './notificationEventParsing';

/**
 * Opens the release page for a notification-tapped release. The Releases tab
 * is selected first so hardware/gesture back from the release page lands on
 * the new-releases list instead of whatever screen/tab was previously open
 * (or exiting the app after a cold start).
 */
export const navigateToReleaseFromNotification = (releaseId: string): void => {
  runWhenNavigationReady(() => {
    try {
      navigationRef.navigate('Home', { screen: 'Releases' });
      navigationRef.navigate('Release', { releaseId });
    } catch (error) {
      console.error('fcm: navigate to release failed', { releaseId, error });
      captureAppError(error, { scope: 'fcm', action: 'navigate-to-release', releaseId });
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
