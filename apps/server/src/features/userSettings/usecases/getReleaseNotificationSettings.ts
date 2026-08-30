import type { UserSettingsUseCaseDependencies } from '../ports.js';

export const createGetReleaseNotificationSettingsUseCase =
    ({
        releaseNotificationSettingsRepository,
    }: Pick<UserSettingsUseCaseDependencies, 'releaseNotificationSettingsRepository'>) =>
    async (userId: string) =>
        await releaseNotificationSettingsRepository.getSettings(userId);
