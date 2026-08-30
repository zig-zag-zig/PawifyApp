import type { EventPayload } from '../eventService';

export type ExtractedNotificationEventData = {
  eventName: string;
  payload?: EventPayload;
};

export const persistedNotificationEventNames = new Set([
  'following',
  'releases',
  'releaseNotificationSettings',
  'taskCompleted',
]);

export function extractTaskId(payload: EventPayload | undefined): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const maybeTaskId = payload.taskId ?? payload.id;
  return typeof maybeTaskId === 'string' && maybeTaskId.length > 0
    ? maybeTaskId
    : null;
}

export function shouldPersistBackgroundEvent(eventName: string): boolean {
  return persistedNotificationEventNames.has(eventName) ||
    eventName.startsWith('taskCompleted:');
}

export function getTaskCompletedEventName(payload: EventPayload | undefined): string | null {
  const taskId = extractTaskId(payload);
  return taskId ? `taskCompleted:${taskId}` : null;
}

/**
 * Release id attached to new-release notifications so a notification tap
 * can deep-link straight to that release's page.
 */
export function extractReleaseIdFromEventPayload(payload: EventPayload | undefined): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const maybeReleaseId = payload.releaseId ?? payload.release_id;
  return typeof maybeReleaseId === 'string' && maybeReleaseId.trim().length > 0
    ? maybeReleaseId
    : null;
}

/**
 * Deep-link destination for a notification tap, routed by event name.
 * Task events and unknown events do not navigate (they only refresh data
 * in place via the EventService).
 */
export function getDeepLinkPathForEvent(eventName: string): string | null {
  if (eventName.startsWith('taskCompleted')) {
    return null;
  }

  switch (eventName) {
    case 'releases':
      return '/releases';
    case 'following':
      return '/artists';
    case 'releaseNotificationSettings':
      return '/menu';
    default:
      return null;
  }
}

export function extractNotificationEventPayload(eventData: unknown): EventPayload | undefined {
  if (!eventData || typeof eventData !== 'object' || Array.isArray(eventData)) {
    return undefined;
  }

  const record = eventData as Record<string, unknown>;
  if (record.payload && typeof record.payload === 'object' && !Array.isArray(record.payload)) {
    return record.payload as EventPayload;
  }

  const payload: Record<string, unknown> = { ...record };
  delete payload.eventName;
  delete payload.dataString;
  delete payload.body;

  return Object.keys(payload).length > 0 ? payload : undefined;
}

export function extractNotificationEventData(data: unknown): ExtractedNotificationEventData | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return null;
  }

  const dataRecord = data as Record<string, unknown>;
  const payloadString = dataRecord.dataString ?? dataRecord.body;
  const envelopeEventName = typeof dataRecord.eventName === 'string' ? dataRecord.eventName : null;
  let eventData: Record<string, unknown> = dataRecord;

  if (typeof payloadString === 'string' && payloadString.length > 0) {
    try {
      const parsedEventData = JSON.parse(payloadString) as unknown;
      if (parsedEventData && typeof parsedEventData === 'object' && !Array.isArray(parsedEventData)) {
        eventData = parsedEventData as Record<string, unknown>;
        if (envelopeEventName && typeof eventData.eventName !== 'string') {
          eventData = {
            ...eventData,
            eventName: envelopeEventName,
          };
        }
      }
    } catch (error) {
      if (envelopeEventName) {
        console.warn('fcm: parse notification payload failed; using notification envelope', {
          eventName: envelopeEventName,
          error: error instanceof Error ? error.message : String(error),
          payloadPreview: payloadString.slice(0, 240),
        });
      } else {
        console.warn('fcm: parse notification payload failed', {
          error: error instanceof Error ? error.message : String(error),
          payloadPreview: payloadString.slice(0, 240),
        });
        return null;
      }
    }
  }

  const eventName = typeof eventData.eventName === 'string'
    ? eventData.eventName
    : envelopeEventName;

  return eventName
    ? {
      eventName,
      payload: extractNotificationEventPayload({
        ...eventData,
        eventName,
      }),
    }
    : null;
}
