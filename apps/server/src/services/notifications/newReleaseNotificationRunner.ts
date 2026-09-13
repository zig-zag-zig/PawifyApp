import { createLogger } from '../../common/logging/logger.js';
import { mapWithConcurrency } from '../../utils/helpers/promisePool.js';
import { getAllUsers } from '../firebase/userStore.js';
import {
    acquireNotifyNewReleasesLock,
    releaseNotifyNewReleasesLock,
} from '../firebase/notificationRunLockStore.js';
import { getNewReleases } from '../musicbrainz/newReleaseDetection.js';
import { getValidPushTokens, sendPushNotificationToTokens } from './pushNotificationDelivery.js';
import { buildReleaseNotifications } from './releaseNotificationContent.js';
import { deliverReleaseNotifications } from './releaseNotificationDelivery.js';
import { cacheConfig } from '../../config/runtimeConfig.js';

const logger = createLogger('services.notifications');
const newReleaseNotificationUserConcurrency = 4;

/**
 * Visible pushes are sent one-per-release up to this count; when a scan finds
 * more new releases than this, the remainder are collapsed into a single
 * digest push so a busy drop day cannot spam the device.
 */
const maxIndividualReleaseNotifications = cacheConfig.maxIndividualReleaseNotifications;

type NotificationDelivery = {
    visibleNotificationsSent: number;
    userHasNewReleases: boolean;
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
        const validPushTokens = await getValidPushTokens(userId);

        const { visibleNotificationsSent } = await deliverReleaseNotifications(notifications, {
            maxIndividual: maxIndividualReleaseNotifications,
            hasPushTokens: validPushTokens.length > 0,
            send: async (options, mode) => {
                await sendPushNotificationToTokens(userId, validPushTokens, options, mode);
            },
        });
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
