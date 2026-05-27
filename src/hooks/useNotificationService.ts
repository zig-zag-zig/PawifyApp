import * as Device from 'expo-device';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { EventService, EventPayload } from '../services/eventService';
import { getExternalNavigationResumeDelayMs } from '../services/externalNavigation';
import {
  addPendingBackgroundEvent,
  takePendingBackgroundEvents,
} from '../services/backgroundEventStorage';
import { getStoredPushToken } from '../services/pushTokenStorage';

const BACKGROUND_NOTIFICATION_TASK = 'background-notification-task';

type ExtractedEventData = {
  eventName: string;
  payload?: EventPayload;
};

function extractTaskId(payload: EventPayload | undefined): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const maybeTaskId = payload.taskId ?? payload.id;
  return typeof maybeTaskId === 'string' && maybeTaskId.length > 0
    ? maybeTaskId
    : null;
}

function shouldPersistBackgroundEvent(eventName: string) {
  return eventName === 'following'
    || eventName === 'releases'
    || eventName === 'releaseNotificationSettings'
    || eventName === 'taskCompleted'
    || eventName.startsWith('taskCompleted:');
}

function getTaskCompletedEventName(payload: EventPayload | undefined): string | null {
  const taskId = extractTaskId(payload);
  return taskId ? `taskCompleted:${taskId}` : null;
}

function extractEventPayload(eventData: any): EventPayload | undefined {
  if (!eventData || typeof eventData !== 'object') {
    return undefined;
  }

  if (eventData.payload && typeof eventData.payload === 'object') {
    return eventData.payload as EventPayload;
  }

  const payload = { ...eventData };
  delete payload.eventName;
  delete payload.dataString;
  delete payload.body;

  return Object.keys(payload).length > 0 ? payload : undefined;
}

function registerEvent(eventName: string, payload: EventPayload | undefined, source: string) {
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

function extractEventData(data: any): ExtractedEventData | null {
  const payloadString = data?.dataString ?? data?.body;
  let eventData = data;
  const envelopeEventName = typeof data?.eventName === 'string' ? data.eventName : null;

  if (typeof payloadString === 'string' && payloadString.length > 0) {
    try {
      const parsedEventData = JSON.parse(payloadString);
      if (parsedEventData && typeof parsedEventData === 'object') {
        eventData = parsedEventData;
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

  const eventName = typeof eventData?.eventName === 'string'
    ? eventData.eventName
    : envelopeEventName;

  return eventName
    ? {
      eventName,
      payload: extractEventPayload({
        ...eventData,
        eventName,
      }),
    }
    : null;
}

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

TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }: { data: any, error: any }) => {
  if (error) {
    console.error('fcm: background task failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  await hydrateClientPushToken();

  const innerData = data?.data || {};
  const eventData = extractEventData(innerData);
  if (eventData) {
    const eventAdded = registerEvent(eventData.eventName, eventData.payload, 'background-task');
    if (eventAdded && shouldPersistBackgroundEvent(eventData.eventName)) {
      const persistedEventName = eventData.eventName === 'taskCompleted'
        ? getTaskCompletedEventName(eventData.payload) ?? eventData.eventName
        : eventData.eventName;
      await addPendingBackgroundEvent(persistedEventName, eventData.payload);
    }
  }
});

export const useNotificationService = ({ enabled }: { enabled: boolean }) => {
  const releasesDeepLink = Linking.createURL('/releases');

  const createNotificationChannel = async () => {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }
  };

  useEffect(() => {
    if (!enabled) return;

    // Notification handler
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const { title, body } = notification.request.content;
        const shouldShow = !!title || !!body;

        return {
          shouldShowBanner: shouldShow,
          shouldShowList: shouldShow,
          shouldPlaySound: shouldShow,
          shouldSetBadge: false,
        };
      }
    });

    createNotificationChannel();

    const replayBackgroundEvents = async () => {
      try {
        const backgroundEvents = await takePendingBackgroundEvents();
        backgroundEvents.forEach(event => {
          registerEvent(event.eventName, event.payload, 'background-replay');
        });
      } catch (error) {
        console.warn('fcm: replay background events failed', error);
      }
    };

    const registerTask = () => {
      if (Platform.OS !== 'android') {
        return;
      }

      try {
        Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK)
          .catch(e => console.error('fcm: register background task failed', e));
      } catch (e) {
        console.error('fcm: register background task failed', e);
      }
    };

    const replayTimeouts: ReturnType<typeof setTimeout>[] = [];

    const appStateListener = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        const delayMs = getExternalNavigationResumeDelayMs({
          quietMs: 9000,
          stagger: true,
          staggerStepMs: 90,
          maxStaggerMs: 2200,
        });

        if (delayMs > 0) {
          replayTimeouts.push(setTimeout(() => void replayBackgroundEvents(), delayMs));
          return;
        }

        void replayBackgroundEvents();
      }
    });

    // Foreground listener
    const foregroundListener = Notifications.addNotificationReceivedListener(notification => {
      const { data } = notification.request.content;
      const eventData = extractEventData(data);
      if (eventData) {
        registerEvent(eventData.eventName, eventData.payload, 'foreground-listener');
        return;
      }
    });

    const droppedListener = Notifications.addNotificationsDroppedListener(() => {
      console.warn('fcm: notifications dropped by FCM before delivery');
    });

    // Background click listener (visible notifications only)
    const backgroundListener = Notifications.addNotificationResponseReceivedListener(
      async (response) => {
        const { title, body } = response.notification.request.content;

        if (title || body) {
          try {
            await Linking.openURL(releasesDeepLink);
          } catch (error) {
            console.error('fcm: open release deep link failed', error);
          }
        }
      }
    );

    // Killed state handler (visible notifications only)
    const handleKilledStateNotification = async () => {
      const response = Notifications.getLastNotificationResponse();
      if (response?.notification.request.content.title ||
        response?.notification.request.content.body) {
        setTimeout(async () => {
          try {
            await Linking.openURL(releasesDeepLink);
          } catch (error) {
            console.error('fcm: open killed-state release deep link failed', error);
          }
        }, Device.osName === 'iOS' ? 300 : 500);
      }
    };

    registerTask();
    void replayBackgroundEvents();
    handleKilledStateNotification();

    return () => {
      replayTimeouts.forEach(timeoutRef => clearTimeout(timeoutRef));
      appStateListener.remove();
      foregroundListener.remove();
      droppedListener.remove();
      backgroundListener.remove();
    };
  }, [enabled]);
};
