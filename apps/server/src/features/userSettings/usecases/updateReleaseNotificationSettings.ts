import { ReleaseNotificationSettings } from '@pawify/shared';
import { mapWithConcurrency } from '../../../utils/helpers/promisePool.js';
import { releaseDateMatchesNotificationSettings } from '../../../utils/helpers/releaseNotificationFilter.js';
import type { UserSettingsUseCaseDependencies } from '../ports.js';

const KNOWN_RELEASE_REBUILD_CONCURRENCY = 3;

const rebuildKnownReleasesForSettings = async (
    {
        followedArtistsRepository,
        knownReleaseRepository,
        newReleaseRepository,
        releaseCatalogGateway,
    }: Pick<
        UserSettingsUseCaseDependencies,
        | 'followedArtistsRepository'
        | 'knownReleaseRepository'
        | 'newReleaseRepository'
        | 'releaseCatalogGateway'
    >,
    userId: string,
    settings: ReleaseNotificationSettings,
): Promise<void> => {
    const artistIds = await followedArtistsRepository.getFollowedArtistIds(userId);

    await mapWithConcurrency(artistIds, KNOWN_RELEASE_REBUILD_CONCURRENCY, async (artistId) => {
        const releaseGroups = await releaseCatalogGateway.getArtistReleases(artistId);
        // Known state is a set of release groups: widen or narrow it by each group's
        // own date, so the next scan neither re-notifies an album the user has seen
        // nor keeps one that has fallen outside the window.
        const groupState = new Map(
            releaseGroups
                .filter((group) => releaseDateMatchesNotificationSettings(group.date, settings))
                .map((group) => [group.id, ''] as const),
        );

        await knownReleaseRepository.replaceArtistReleaseGroupState(userId, artistId, groupState);
    });

    await newReleaseRepository.removeReleasesOutsideSettings(userId, settings);
};

export const createUpdateReleaseNotificationSettingsUseCase =
    (dependencies: UserSettingsUseCaseDependencies) =>
    async (
        userId: string,
        settings: ReleaseNotificationSettings,
        sourcePushToken?: string,
    ): Promise<ReleaseNotificationSettings> => {
        const previousSettings =
            await dependencies.releaseNotificationSettingsRepository.getSettings(userId);
        const savedSettings = await dependencies.releaseNotificationSettingsRepository.saveSettings(
            userId,
            settings,
        );

        try {
            await rebuildKnownReleasesForSettings(dependencies, userId, savedSettings);
        } catch (error) {
            await dependencies.releaseNotificationSettingsRepository.saveSettings(
                userId,
                previousSettings,
            );
            throw error;
        }

        await Promise.all([
            dependencies.userSettingsNotifier.notifySettingsChanged(
                userId,
                savedSettings,
                sourcePushToken,
            ),
            dependencies.userSettingsNotifier.notifyReleasesChanged(userId, sourcePushToken),
        ]);

        return savedSettings;
    };
