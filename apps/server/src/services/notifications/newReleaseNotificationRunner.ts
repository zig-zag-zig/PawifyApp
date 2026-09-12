import { createLogger } from '../../common/logging/logger.js';
import { nameWithDisambiguation } from '@pawify/shared';
import { mapWithConcurrency } from '../../utils/helpers/promisePool.js';
import { getAllUsers } from '../firebase/userStore.js';
import {
    acquireNotifyNewReleasesLock,
    releaseNotifyNewReleasesLock,
} from '../firebase/notificationRunLockStore.js';
import { getNewReleases } from '../musicbrainz/newReleaseDetection.js';
import { getValidPushTokens, sendPushNotificationToTokens } from './pushNotificationDelivery.js';
import { notificationEvents } from './notificationEvents.js';

const logger = createLogger('services.notifications');
const newReleaseNotificationUserConcurrency = 4;
const userVisibleNotificationConcurrency = 4;

/**
 * Visible pushes are sent one-per-release up to this count; when a scan finds
 * more new releases than this, the remainder are collapsed into a single
 * digest push so a busy drop day cannot spam the device.
 */
const maxIndividualReleaseNotifications = 3;

type NotificationDelivery = {
    visibleNotificationsSent: number;
    userHasNewReleases: boolean;
};

const buildReleaseNotifications = (
    notificationsData: Awaited<ReturnType<typeof getNewReleases>>,
) => {
    const releaseMap = new Map<
        string,
        {
            title: string;
            artistNames: Set<string>;
            disambiguation: string | null;
            date_for_display: string;
        }
    >();

    for (const release of notificationsData) {
        const artistNames = Object.values(release.artists)
            .map((name) => name.trim())
            .filter(Boolean);

        if (artistNames.length === 0) {
            artistNames.push('Unknown Artist');
        }

        if (releaseMap.has(release.id)) {
            const existingEntry = releaseMap.get(release.id)!;
            artistNames.forEach((name) => existingEntry.artistNames.add(name));
        } else {
            releaseMap.set(release.id, {
                title: release.title,
                artistNames: new Set(artistNames),
                disambiguation: release.disambiguation,
                date_for_display: release.date_for_display,
            });
        }
    }

    return Array.from(releaseMap.entries()).map(
        ([releaseId, { title, disambiguation, artistNames, date_for_display }]) => ({
            body: `By ${Array.from(artistNames).join(', ')}\nReleased ${date_for_display}`,
            title: nameWithDisambiguation(disambiguation, title),
            // Lets the app deep-link to this release's page when the
            // notification is tapped.
            data: {
                eventName: notificationEvents.releases,
                payload: { releaseId },
            },
        }),
    );
};

type BuiltReleaseNotification = ReturnType<typeof buildReleaseNotifications>[number];

/**
 * One-line-per-release digest body for the notifications that overflowed the
 * per-release cap. Tapping it opens the Releases tab (no single release id), so
 * the user lands on the full list.
 */
const buildDigestNotificationBody = (
    notifications: BuiltReleaseNotification[],
): string => {
    const digestLines = notifications.map((notification) => notification.title);
    const shownTitles = digestLines.slice(0, 10);
    const remaining = digestLines.length - shownTitles.length;

    return remaining > 0
        ? [...shownTitles, `+${remaining} more`].join('\n')
        : shownTitles.join('\n');
};

const notifyUserAboutNewReleases = async (userId: string): Promise<NotificationDelivery> => {
    try {
        const startedAt = Date.now();
        logger.debug('notify user about new releases started', { userId });

        const notificationsData = await getNewReleases(userId);
        if (notificationsData.length === 0) {
            logger.debug('notify user about new releases completed', {
                userId,
                userHasNewReleases: false,
                releaseCount: 0,
                visibleNotificationsSent: 0,
                durationMs: Date.now() - startedAt,
            });
            return { userHasNewReleases: false, visibleNotificationsSent: 0 };
        }

        const notifications = buildReleaseNotifications(notificationsData);
        const individualNotifications = notifications.slice(0, maxIndividualReleaseNotifications);
        const digestNotifications = notifications.slice(maxIndividualReleaseNotifications);
        const validPushTokens = await getValidPushTokens(userId);

        if (validPushTokens.length > 0) {
            await mapWithConcurrency(
                individualNotifications,
                userVisibleNotificationConcurrency,
                async (notification) => {
                    await sendPushNotificationToTokens(userId, validPushTokens, notification);
                },
            );

            if (digestNotifications.length > 0) {
                await sendPushNotificationToTokens(userId, validPushTokens, {
                    title: `${digestNotifications.length} more new releases`,
                    body: buildDigestNotificationBody(digestNotifications),
                    data: { eventName: notificationEvents.releases },
                });
            }

            await sendPushNotificationToTokens(
                userId,
                validPushTokens,
                {
                    eventName: notificationEvents.releases,
                },
                'data',
            );
        }

        const visibleNotificationsSent = validPushTokens.length > 0
            ? individualNotifications.length + (digestNotifications.length > 0 ? 1 : 0)
            : 0;
        logger.debug('notify user about new releases completed', {
            userId,
            userHasNewReleases: true,
            releaseCount: notificationsData.length,
            uniqueNotificationCount: notifications.length,
            pushRecipientsValid: validPushTokens.length,
            visibleNotificationsSent,
            durationMs: Date.now() - startedAt,
        });

        return {
            userHasNewReleases: true,
            visibleNotificationsSent,
        };
    } catch (error) {
        logger.error('failed to process user notifications', { userId, error });
        return { userHasNewReleases: false, visibleNotificationsSent: 0 };
    }
};

export const notifyNewReleases = async (): Promise<void> => {
    let lock: Awaited<ReturnType<typeof acquireNotifyNewReleasesLock>> = null;

    try {
        lock = await acquireNotifyNewReleasesLock();
        if (!lock) {
            logger.warn('new release notification run skipped (lock already held)');
            return;
        }

        const startedAt = Date.now();
        const users = await getAllUsers();
        logger.debug('new release notification run started', {
            lockExpiresAt: lock.expiresAt,
            userCount: users.length,
        });

        const deliveries = await mapWithConcurrency(
            users,
            newReleaseNotificationUserConcurrency,
            async (user) => await notifyUserAboutNewReleases(user.uid),
        );

        const usersWithNewReleases = deliveries.filter(
            (delivery) => delivery.userHasNewReleases,
        ).length;
        const visibleNotificationsSent = deliveries.reduce(
            (total, delivery) => total + delivery.visibleNotificationsSent,
            0,
        );

        logger.debug('new release notification run completed', {
            userCount: users.length,
            usersWithNewReleases,
            visibleNotificationsSent,
            durationMs: Date.now() - startedAt,
        });
    } catch (error) {
        logger.error('new release notification run failed', { error });
        throw new Error(`Failed to send push notifications: ${error}`);
    } finally {
        if (!lock) {
            return;
        }

        try {
            await releaseNotifyNewReleasesLock(lock);
        } catch (error) {
            logger.error('failed to release new release notification run lock', { error });
        }
    }
};
