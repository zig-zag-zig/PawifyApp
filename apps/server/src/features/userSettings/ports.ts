import type { Release, ReleaseNotificationSettings } from '../../modules/models/models.js';

export type ReleaseNotificationSettingsRepository = {
    getSettings(userId: string): Promise<ReleaseNotificationSettings>;
    saveSettings(
        userId: string,
        settings: ReleaseNotificationSettings,
    ): Promise<ReleaseNotificationSettings>;
};

export type UserFollowedArtistsRepository = {
    getFollowedArtistIds(userId: string): Promise<string[]>;
};

export type KnownReleaseRepository = {
    replaceArtistReleaseIds(userId: string, artistId: string, releaseIds: string[]): Promise<void>;
};

export type NewReleaseRepository = {
    removeReleasesOutsideSettings(
        userId: string,
        settings: ReleaseNotificationSettings,
    ): Promise<void>;
};

export type ReleaseCatalogGateway = {
    getArtistReleases(artistId: string): Promise<Release[]>;
};

export type UserSettingsNotifier = {
    notifySettingsChanged(
        userId: string,
        settings: ReleaseNotificationSettings,
        sourcePushToken?: string,
    ): Promise<void>;
    notifyReleasesChanged(userId: string, sourcePushToken?: string): Promise<void>;
};

export type UserSettingsUseCaseDependencies = {
    followedArtistsRepository: UserFollowedArtistsRepository;
    knownReleaseRepository: KnownReleaseRepository;
    newReleaseRepository: NewReleaseRepository;
    releaseCatalogGateway: ReleaseCatalogGateway;
    releaseNotificationSettingsRepository: ReleaseNotificationSettingsRepository;
    userSettingsNotifier: UserSettingsNotifier;
};
