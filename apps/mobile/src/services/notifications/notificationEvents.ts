import { EventPayload, EventService } from '../eventService';
import {
  extractNotificationEventData,
  extractNotificationEventPayload,
  extractReleaseIdFromEventPayload,
  extractTaskId,
  getDeepLinkPathForEvent,
  getTaskCompletedEventName,
  persistedNotificationEventNames,
  shouldPersistBackgroundEvent,
  type ExtractedNotificationEventData,
} from './notificationEventParsing';

export {
  extractNotificationEventData,
  extractNotificationEventPayload,
  extractReleaseIdFromEventPayload,
  extractTaskId,
  getDeepLinkPathForEvent,
  getTaskCompletedEventName,
  persistedNotificationEventNames,
  shouldPersistBackgroundEvent,
  type ExtractedNotificationEventData,
};

export function registerNotificationEvent(
  eventName: string,
  payload: EventPayload | undefined,
  source: string,
): boolean {
  const taskId = extractTaskId(payload);
  const eventAdded = EventService.addEvent(eventName, payload);

  if (eventName !== 'taskCompleted') {
    return eventAdded;
  }

  if (!taskId) {
    console.warn('fcm: taskCompleted payload missing taskId', {
      source,
      eventName,
      payloadKeys: payload ? Object.keys(payload) : [],
      payload,
    });
    return eventAdded;
  }

  const taskEventAdded = EventService.addEvent(`taskCompleted:${taskId}`, payload);
  return eventAdded || taskEventAdded;
}

export async function persistNotificationEvent(
  eventName: string,
  payload: EventPayload | undefined,
): Promise<void> {
  const { addPendingBackgroundEvent } = await import('../backgroundEventStorage');
  const persistedEventName = eventName === 'taskCompleted'
    ? getTaskCompletedEventName(payload) ?? eventName
    : eventName;

  await addPendingBackgroundEvent(persistedEventName, payload);
}
