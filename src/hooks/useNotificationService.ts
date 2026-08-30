import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { getExternalNavigationResumeDelayMs } from '../services/externalNavigation';
import { captureAppError } from '../services/monitoring/reportError';
import { takePendingBackgroundEvents } from '../services/backgroundEventStorage';
import {
  extractNotificationEventData,
  registerNotificationEvent,
} from '../services/notifications/notificationEvents';
import { openNotificationNavigation } from '../services/notifications/notificationNavigation';
import {
  BACKGROUND_NOTIFICATION_TASK,
  defineBackgroundNotificationTask,
} from '../services/notifications/notificationBackgroundTask';

// Registered once at module load: headless task wiring must exist before
// Notifications.registerTaskAsync runs.
defineBackgroundNotificationTask();

export const useNotificationService = ({ enabled }: { enabled: boolean }) => {
  const openNavigationForEvent = async (eventData: { eventName: string; payload?: Record<string, unknown> } | null) => {
    if (!eventData) {
      return;
    }

    await openNotificationNavigation(eventData.eventName, eventData.payload);
  };

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
          registerNotificationEvent(event.eventName, event.payload, 'background-replay');
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
      const eventData = extractNotificationEventData(data);
      if (eventData) {
        registerNotificationEvent(eventData.eventName, eventData.payload, 'foreground-listener');
        return;
      }
    });

    const droppedListener = Notifications.addNotificationsDroppedListener(() => {
      console.warn('fcm: notifications dropped by FCM before delivery');
    });

    // Background click listener (visible notifications only)
    const backgroundListener = Notifications.addNotificationResponseReceivedListener(
      async (response) => {
        const { title, body, data } = response.notification.request.content;

        if (title || body) {
          await openNavigationForEvent(extractNotificationEventData(data));
        }
      }
    );

    // Killed state handler (visible notifications only)
    const handleKilledStateNotification = async () => {
      const response = Notifications.getLastNotificationResponse();
      const { title, body, data } = response?.notification.request.content ?? {};
      if (title || body) {
        setTimeout(() => {
          void openNavigationForEvent(extractNotificationEventData(data));
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
