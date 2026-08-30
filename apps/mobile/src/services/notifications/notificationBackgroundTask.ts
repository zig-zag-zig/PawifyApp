import * as TaskManager from 'expo-task-manager';
import { EventService } from '../eventService';
import { getStoredPushToken } from '../pushTokenStorage';
import { takePendingBackgroundEvents } from '../backgroundEventStorage';
import {
  extractNotificationEventData,
  persistNotificationEvent,
  registerNotificationEvent,
  shouldPersistBackgroundEvent,
} from './notificationEvents';

export const BACKGROUND_NOTIFICATION_TASK = 'background-notification-task';

async function hydrateClientPushToken() {
  if (EventService.getClientPushToken()) {
    return;
  }

  try {
    const pushToken = await getStoredPushToken();
    if (pushToken) {
      EventService.setClientPushToken(pushToken);
    }
  } catch (error) {
    console.warn('fcm: hydrate client push token failed', error);
  }
}

/**
 * Registers the OS-level background notification task. Must run exactly once
 * before Notifications.registerTaskAsync is called. Kept separate from the
 * hook so the headless-task wiring is testable and importable on its own.
 */
export function defineBackgroundNotificationTask(): void {
  TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }: { data: any, error: any }) => {
    if (error) {
      console.error('fcm: background task failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    await hydrateClientPushToken();

    const innerData = data?.data || {};
    const eventData = extractNotificationEventData(innerData);
    if (eventData) {
      const eventAdded = registerNotificationEvent(eventData.eventName, eventData.payload, 'background-task');
      if (eventAdded && shouldPersistBackgroundEvent(eventData.eventName)) {
        await persistNotificationEvent(eventData.eventName, eventData.payload);
      }
    }
  });
}
