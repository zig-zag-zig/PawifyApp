import { useSyncExternalStore } from 'react';
import {
  getPendingReleaseNavigation,
  subscribeToPendingReleaseNavigation,
} from '../services/notifications/notificationNavigation';

/**
 * True while a notification-triggered release navigation is being applied.
 * The app keeps its global spinner up during that window so the default tab
 * never flashes before the release page's own loading spinner takes over.
 */
export function useReleaseNotificationNavigationPending(): boolean {
  return useSyncExternalStore(
    subscribeToPendingReleaseNavigation,
    getPendingReleaseNavigation,
    getPendingReleaseNavigation,
  );
}