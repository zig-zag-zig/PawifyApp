import { ReleaseNotificationSettings } from '@pawify/shared';
import { mapWithConcurrency } from '../../../utils/helpers/promisePool.js';
import { getNotificationCandidateReleases } from '../../../features/releases/domain/releaseProcessing.js';
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
        const releases = await releaseCatalogGateway.getArtistReleases(artistId);
        const releaseIds = getNotificationCandidateReleases(releases, undefined, settings).map(
            (release) => release.id,
        );

        await knownReleaseRepository.replaceArtistReleaseIds(userId, artistId, releaseIds);
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
