import { getFollowingFromDb } from '../../../services/firebase/followingStore.js';
import {
    getReleaseNotificationSettingsFromDb,
    saveReleaseNotificationSettingsToDb,
} from '../../../services/firebase/userSettingsStore.js';
import { replaceKnownArtistReleaseGroupStateInDb } from '../../../services/firebase/knownReleasesStore.js';
import {
    readNewReleasesState,
    writeNewReleasesState,
} from '../../../services/firebase/newReleasesStore.js';
import { getArtistReleaseGroupCatalog } from '../../../services/musicbrainz/artistReleaseGroupCatalog.js';
import { createLogger } from '../../../common/logging/logger.js';
import { sendDataOnlyNotification } from '../../../services/notifications/dataNotificationPublisher.js';
import { notificationEvents } from '../../../services/notifications/notificationEvents.js';
import { releaseDateMatchesNotificationSettings } from '../../../utils/helpers/releaseNotificationFilter.js';
import type { UserSettingsUseCaseDependencies } from '../ports.js';

const logger = createLogger('features.userSettings.dependencies');

export const userSettingsDependencies: UserSettingsUseCaseDependencies = {
    followedArtistsRepository: {
        getFollowedArtistIds: async (userId) => await getFollowingFromDb(userId),
    },
    knownReleaseRepository: {
        replaceArtistReleaseGroupState: async (userId, artistId, groupState) => {
            await replaceKnownArtistReleaseGroupStateInDb(userId, artistId, groupState);
        },
    },
    newReleaseRepository: {
        removeReleasesOutsideSettings: async (userId, settings) => {
            const currentState = await readNewReleasesState(userId);
            const updatedState = Object.fromEntries(
                Object.entries(currentState).filter(([, release]) =>
                    releaseDateMatchesNotificationSettings(release.date, settings),
                ),
            );

            if (Object.keys(updatedState).length !== Object.keys(currentState).length) {
                await writeNewReleasesState(userId, updatedState);
            }
        },
    },
    releaseCatalogGateway: {
        getArtistReleases: async (artistId) =>
            (await getArtistReleaseGroupCatalog(artistId)).groups,
    },
    releaseNotificationSettingsRepository: {
        getSettings: async (userId) => await getReleaseNotificationSettingsFromDb(userId),
        saveSettings: async (userId, settings) =>
            await saveReleaseNotificationSettingsToDb(userId, settings),
    },
    userSettingsNotifier: {
        notifySettingsChanged: async (userId, settings, sourcePushToken) => {
            try {
                await sendDataOnlyNotification(
                    userId,
                    notificationEvents.releaseNotificationSettings,
                    {
                        settings,
                        sourcePushToken,
                    },
                    {
                        excludePushToken: sourcePushToken,
                    },
                );
            } catch (error) {
                // Best-effort: the settings write already committed; a push
                // notification failure must not fail the request.
                logger.warn('failed to send settings-changed notification', { userId, error });
            }
        },
        notifyReleasesChanged: async (userId, sourcePushToken) => {
            try {
                await sendDataOnlyNotification(
                    userId,
                    notificationEvents.releases,
                    {
                        sourcePushToken,
                    },
                    {
                        excludePushToken: sourcePushToken,
                    },
                );
            } catch (error) {
                // Best-effort: the write already committed; a push notification
                // failure must not fail the request.
                logger.warn('failed to send releases-changed notification', { userId, error });
            }
        },
    },
};
