import { ReleaseNotificationSettings } from '@pawify/shared';
import { mapWithConcurrency } from '../../../utils/helpers/promisePool.js';
import { emptyKnownReleaseGroupState } from '../../releases/domain/releaseGroupProcessing.js';
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
        const catalog = await releaseCatalogGateway.getArtistReleaseCatalog(artistId);
        // A partial catalogue must not rewrite known state: dropping groups that
        // merely failed to load would make the next complete scan re-notify them.
        if (!catalog.complete) {
            return;
        }

        // Pre-migration scalar state must be migrated before a rebuild can safely
        // rewrite it; otherwise known groups outside the catalogue would be lost.
        if (await knownReleaseRepository.hasUnmigratedArtistReleaseGroupState(userId, artistId)) {
            return;
        }

        const currentState = await knownReleaseRepository.getArtistReleaseGroupState(
            userId,
            artistId,
        );
        // Feed eligibility and remembered content are separate concerns: keep the
        // complete history, including groups currently outside the date window.
        // Deleting history here makes a later unchanged pressing look like a new
        // group and re-notifies. Newly encountered groups are marked unbaselined so
        // the next scan records content silently.
        const groupState = new Map(Object.entries(currentState));
        for (const group of catalog.groups) {
            if (!groupState.has(group.id)) {
                groupState.set(group.id, emptyKnownReleaseGroupState('', false));
            }
        }

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
