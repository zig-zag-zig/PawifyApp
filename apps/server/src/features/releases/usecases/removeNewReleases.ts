import type { ReleaseWriteUseCaseDependencies } from '../ports.js';

export const createRemoveNewReleasesUseCase =
    ({
        newReleasesRepository,
        releaseNotifier,
    }: Pick<ReleaseWriteUseCaseDependencies, 'newReleasesRepository' | 'releaseNotifier'>) =>
    async (userId: string, releaseIds: string[], sourcePushToken?: string): Promise<void> => {
        await newReleasesRepository.deleteNewReleases(userId, releaseIds);
        await releaseNotifier.notifyReleasesChanged(userId, sourcePushToken);
    };
