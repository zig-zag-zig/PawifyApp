import type { ReleaseNotificationSettings } from '@pawify/shared';

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
    replaceArtistReleaseGroupState(
        userId: string,
        artistId: string,
        groupState: ReadonlyMap<string, string>,
    ): Promise<void>;
};

export type NewReleaseRepository = {
    removeReleasesOutsideSettings(
        userId: string,
        settings: ReleaseNotificationSettings,
    ): Promise<void>;
};

export type ReleaseGroupForSettings = { id: string; date: string | null };

export type ReleaseCatalogGateway = {
    getArtistReleases(artistId: string): Promise<ReleaseGroupForSettings[]>;
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
