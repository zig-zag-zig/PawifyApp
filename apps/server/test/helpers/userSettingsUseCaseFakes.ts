import type { UserSettingsUseCaseDependencies } from '../../src/features/userSettings/ports.js';
import type { Release, ReleaseNotificationSettings } from '@pawify/shared';
import { createReleaseNotificationSettings } from './releaseFixtures.js';

type UserSettingsFakeOptions = {
    catalog?: Record<string, Release[]>;
    previousSettings?: ReleaseNotificationSettings;
    failArtistId?: string;
};

export const createUserSettingsDependencies = (options: UserSettingsFakeOptions = {}) => {
    const saveCalls: ReleaseNotificationSettings[] = [];
    const replaceCalls: Array<{ userId: string; artistId: string; releaseIds: string[] }> = [];
    const removeCalls: Array<{ userId: string; settings: ReleaseNotificationSettings }> = [];
    const notificationCalls: string[] = [];
    const previousSettings =
        options.previousSettings ??
        createReleaseNotificationSettings({
            oldestReleaseDateMonths: 12,
            includeReleasesWithoutDate: true,
        });

    const dependencies: UserSettingsUseCaseDependencies = {
        followedArtistsRepository: {
            async getFollowedArtistIds() {
                return Object.keys(options.catalog ?? {});
            },
        },
        knownReleaseRepository: {
            async replaceArtistReleaseIds(userId, artistId, releaseIds) {
                replaceCalls.push({ userId, artistId, releaseIds });
            },
        },
        newReleaseRepository: {
            async removeReleasesOutsideSettings(userId, savedSettings) {
                removeCalls.push({ userId, settings: savedSettings });
            },
        },
        releaseCatalogGateway: {
            async getArtistReleases(artistId) {
                if (artistId === options.failArtistId) {
                    throw new Error('catalog failed');
                }

                return options.catalog?.[artistId] ?? [];
            },
        },
        releaseNotificationSettingsRepository: {
            async getSettings() {
                return previousSettings;
            },
            async saveSettings(_userId, savedSettings) {
                saveCalls.push(savedSettings);
                return savedSettings;
            },
        },
        userSettingsNotifier: {
            async notifySettingsChanged(_userId, _savedSettings, sourcePushToken) {
                notificationCalls.push(`settings:${sourcePushToken ?? ''}`);
            },
            async notifyReleasesChanged(_userId, sourcePushToken) {
                notificationCalls.push(`releases:${sourcePushToken ?? ''}`);
            },
        },
    };

    return {
        dependencies,
        notificationCalls,
        removeCalls,
        replaceCalls,
        saveCalls,
    };
};
