import type { NotificationUseCaseDependencies } from '../ports.js';

export const createNotifyNewReleasesUseCase =
    ({ newReleaseNotificationGateway }: NotificationUseCaseDependencies) =>
    async (): Promise<void> => {
        await newReleaseNotificationGateway.notifyNewReleases();
    };
