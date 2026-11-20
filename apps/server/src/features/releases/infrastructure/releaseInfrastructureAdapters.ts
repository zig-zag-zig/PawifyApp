import {
    getNewReleasesSnapshotFromDb,
    removeNewReleasesFromDb,
} from '../../../services/firebase/newReleasesStore.js';
import { createLogger } from '../../../common/logging/logger.js';
import { sendDataOnlyNotification } from '../../../services/notifications/dataNotificationPublisher.js';
import { notificationEvents } from '../../../services/notifications/notificationEvents.js';
import type { NewReleasesRepository, ReleaseNotifier } from '../ports.js';

const logger = createLogger('features.releases.infrastructure');

export const newReleasesRepository: NewReleasesRepository = {
    getNewReleasesSnapshot: async (userId) => await getNewReleasesSnapshotFromDb(userId),
    deleteNewReleases: removeNewReleasesFromDb,
};

export const releaseNotifier: ReleaseNotifier = {
    notifyReleasesChanged: async (userId, sourcePushToken) => {
        try {
            await sendDataOnlyNotification(userId, notificationEvents.releases, undefined, {
                excludePushToken: sourcePushToken,
            });
        } catch (error) {
            // Best-effort: the write already committed; a push notification
            // failure must not fail the request.
            logger.warn('failed to send releases-changed notification', { userId, error });
        }
    },
};
