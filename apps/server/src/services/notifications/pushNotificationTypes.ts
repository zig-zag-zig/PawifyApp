import type { NotificationEventName } from './notificationEvents.js';

export type PushNotificationOptions = {
    title?: string;
    body?: string;
    eventName?: NotificationEventName;
    payload?: Record<string, unknown>;
    /**
     * Arbitrary data attached to a VISIBLE notification (e.g. the release id
     * for new-release notifications so taps can deep-link to the release).
     * Data notifications build their data from eventName/payload instead.
     */
    data?: Record<string, unknown>;
};

export type PushDeliveryOptions = {
    excludePushToken?: string;
};

export type NotificationMode = 'visible' | 'data';

export type ExpoPushErrorDetails = {
    error?: string;
    expoPushToken?: string;
};

export type ExpoPushMessage = {
    to: string;
    title?: string;
    body?: string;
    data?: Record<string, unknown>;
    sound?: 'default';
    priority?: 'default' | 'normal' | 'high';
    _contentAvailable?: boolean;
};

export type ExpoPushTicket =
    | { status: 'ok'; id: string }
    | { status: 'error'; message: string; details?: ExpoPushErrorDetails };

export type ExpoPushReceipt =
    { status: 'ok' } | { status: 'error'; message?: string; details?: ExpoPushErrorDetails };

export type ExpoPushReceiptId = string;
