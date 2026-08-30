import type { ReleaseWriteUseCaseDependencies } from '../ports.js';

type VerifyReleaseExistenceResult = {
    exists: boolean;
};

export const createVerifyReleaseExistenceUseCase =
    ({
        missingReleaseCleanupRepository,
        releaseCatalogGateway,
        releaseNotifier,
    }: Pick<
        ReleaseWriteUseCaseDependencies,
        'missingReleaseCleanupRepository' | 'releaseCatalogGateway' | 'releaseNotifier'
    >) =>
    async (_userId: string, releaseId: string): Promise<VerifyReleaseExistenceResult> => {
        const exists = await releaseCatalogGateway.releaseExists(releaseId);

        if (exists) {
            return { exists: true };
        }

        const cleanup = await missingReleaseCleanupRepository.removeMissingRelease(releaseId);
        for (const affectedUserId of cleanup.removedFromNewReleasesUserIds) {
            await releaseNotifier.notifyReleasesChanged(affectedUserId);
        }

        return { exists: false };
    };
