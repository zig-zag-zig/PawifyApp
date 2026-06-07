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

export async function cleanupPostAuthDevice(
  deletePushToken: () => Promise<unknown>,
): Promise<void> {
  try {
    try {
      await deletePushToken();
    } catch (error) {
      console.warn('auth: push token cleanup failed', error);
    }
    await removeStoredPushToken();
  } catch (error) {
    console.error('auth: sign-out failed', error);
  } finally {
    EventService.setClientPushToken(null);
  }
}
