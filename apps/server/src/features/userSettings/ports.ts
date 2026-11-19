import type { ReleaseNotificationSettings } from '@pawify/shared';
import type { KnownReleaseGroupStateValue } from '../releases/domain/releaseGroupProcessing.js';
import type { ArtistReleaseGroupCatalog } from '../../services/musicbrainz/artistReleaseGroupCatalog.js';

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
    getArtistReleaseGroupState(
        userId: string,
        artistId: string,
    ): Promise<{ [groupId: string]: KnownReleaseGroupStateValue }>;
    /** True when the artist still carries pre-migration scalar state. */
    hasUnmigratedArtistReleaseGroupState(userId: string, artistId: string): Promise<boolean>;
    replaceArtistReleaseGroupState(
        userId: string,
        artistId: string,
        groupState: ReadonlyMap<string, KnownReleaseGroupStateValue>,
    ): Promise<void>;
};

export type NewReleaseRepository = {
    removeReleasesOutsideSettings(
        userId: string,
        settings: ReleaseNotificationSettings,
    ): Promise<void>;
};

export type ReleaseCatalogGateway = {
    getArtistReleaseCatalog(artistId: string): Promise<ArtistReleaseGroupCatalog>;
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
