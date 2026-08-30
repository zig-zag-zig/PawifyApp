import { sendPushNotification, type PushDeliveryOptions } from './pushNotificationDelivery.js';
import type { NotificationEventName } from './notificationEvents.js';

export const sendDataOnlyNotification = async (
    userId: string,
    eventName: NotificationEventName,
    payload?: Record<string, unknown>,
    deliveryOptions: PushDeliveryOptions = {},
): Promise<void> =>
    await sendPushNotification(
        userId,
        {
            eventName,
            payload,
        },
        deliveryOptions,
    );
