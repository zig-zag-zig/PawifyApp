import { EventService } from '../../../services/eventService';
import { removeStoredPushToken } from '../../../services/pushTokenStorage';

type RegisterForPushNotifications = (
  savePushToken: (pushToken: string) => Promise<string>,
) => Promise<void>;

export async function registerPostAuthDevice(
  registerForPushNotificationsAsync: RegisterForPushNotifications,
  savePushToken: (pushToken: string) => Promise<string>,
): Promise<void> {
  await registerForPushNotificationsAsync(savePushToken);
}

export type CleanupPostAuthDeviceOptions = {
  // When the backend has already removed the device push token (e.g. account
  // deletion), skip the remote deletePushToken call. Local cleanup still runs.
  skipRemotePushTokenCleanup?: boolean;
};

export async function cleanupPostAuthDevice(
  deletePushToken: () => Promise<unknown>,
  { skipRemotePushTokenCleanup = false }: CleanupPostAuthDeviceOptions = {},
): Promise<void> {
  try {
    if (!skipRemotePushTokenCleanup) {
      try {
        await deletePushToken();
      } catch (error) {
        console.warn('auth: push token cleanup failed', error);
      }
    }
    await removeStoredPushToken();
  } catch (error) {
    console.error('auth: sign-out failed', error);
  } finally {
    EventService.setClientPushToken(null);
  }
}
