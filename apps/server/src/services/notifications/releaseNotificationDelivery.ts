import { mapWithConcurrency } from '../../utils/helpers/promisePool.js';
import { notificationEvents } from './notificationEvents.js';
import type { NotificationMode, PushNotificationOptions } from './pushNotificationTypes.js';
import {
    buildDigestNotificationBody,
    buildDigestNotificationTitle,
    splitReleaseNotifications,
    type BuiltReleaseNotification,
} from './releaseNotificationContent.js';

/**
 * Orchestrates the pushes for one user's new releases: up to `maxIndividual`
 * one-per-release visible pushes, a single visible digest for the overflow, and
 * a data-only push so the app can refresh.
 *
 * Delivery is injected so the cap/digest decision is testable without Firebase,
 * MusicBrainz or the Expo push API.
 */

export const userVisibleNotificationConcurrency = 4;

export type SendReleaseNotification = (
    options: PushNotificationOptions,
    mode?: NotificationMode,
) => Promise<void>;

export const deliverReleaseNotifications = async (
    notifications: BuiltReleaseNotification[],
    {
        maxIndividual,
        hasPushTokens,
        send,
    }: {
        maxIndividual: number;
        hasPushTokens: boolean;
        send: SendReleaseNotification;
    },
): Promise<{ visibleNotificationsSent: number }> => {
    const { individual, digest } = splitReleaseNotifications(notifications, maxIndividual);

    if (!hasPushTokens) {
        return { visibleNotificationsSent: 0 };
    }

    await mapWithConcurrency(
        individual,
        userVisibleNotificationConcurrency,
        async (notification) => {
            await send(notification);
        },
    );

    if (digest.length > 0) {
        await send({
            title: buildDigestNotificationTitle(digest.length),
            body: buildDigestNotificationBody(digest),
            data: { eventName: notificationEvents.releases },
        });
    }

    await send({ eventName: notificationEvents.releases }, 'data');

    return {
        visibleNotificationsSent: individual.length + (digest.length > 0 ? 1 : 0),
    };
};
