import { notifyNewReleases } from '../../../services/notifications/newReleaseNotificationRunner.js';
import type { NotificationUseCaseDependencies } from '../ports.js';

export const notificationDependencies: NotificationUseCaseDependencies = {
    newReleaseNotificationGateway: {
        notifyNewReleases,
    },
};
