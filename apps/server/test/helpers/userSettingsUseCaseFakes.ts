import type { UserSettingsUseCaseDependencies } from '../../src/features/userSettings/ports.js';
import type {
    KnownReleaseGroupStateValue,
    ReleaseGroupCandidate,
} from '../../src/features/releases/domain/releaseGroupProcessing.js';
import type { ReleaseNotificationSettings } from '@pawify/shared';
import { createReleaseNotificationSettings } from './releaseFixtures.js';

type UserSettingsFakeOptions = {
    catalog?: Record<
        string,
        { complete?: boolean; groups: ReleaseGroupCandidate[] }
    >;
    currentState?: Record<
        string,
        { [groupId: string]: KnownReleaseGroupStateValue }
    >;
    previousSettings?: ReleaseNotificationSettings;
    failArtistId?: string;
};

export const createUserSettingsDependencies = (options: UserSettingsFakeOptions = {}) => {
    const saveCalls: ReleaseNotificationSettings[] = [];
    const replaceCalls: Array<{
        userId: string;
        artistId: string;
        groupState: ReadonlyMap<string, KnownReleaseGroupStateValue>;
    }> = [];
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
            async getArtistReleaseGroupState(_userId, artistId) {
                return options.currentState?.[artistId] ?? {};
            },
            async replaceArtistReleaseGroupState(userId, artistId, groupState) {
                replaceCalls.push({ userId, artistId, groupState });
            },
        },
        newReleaseRepository: {
            async removeReleasesOutsideSettings(userId, savedSettings) {
                removeCalls.push({ userId, settings: savedSettings });
            },
        },
        releaseCatalogGateway: {
            async getArtistReleaseCatalog(artistId) {
                if (artistId === options.failArtistId) {
                    throw new Error('catalog failed');
                }

                const entry = options.catalog?.[artistId];
                return {
                    groups: entry?.groups ?? [],
                    creditsByGroupId: new Map(),
                    complete: entry?.complete ?? true,
                };
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
