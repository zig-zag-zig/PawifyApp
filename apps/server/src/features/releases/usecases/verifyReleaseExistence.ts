import type { ReleaseWriteUseCaseDependencies } from '../ports.js';

type VerifyReleaseExistenceResult = {
    exists: boolean;
};

/**
 * Local existence check.
 *
 * A mirror miss is not proof that MusicBrainz deleted the release. Remote HEAD
 * probing is removed, and this path deliberately does not run destructive global
 * cleanup: only a confirmed mirror prune/redirect event may do that.
 */
export const createVerifyReleaseExistenceUseCase =
    ({ releaseCatalogGateway }: Pick<ReleaseWriteUseCaseDependencies, 'releaseCatalogGateway'>) =>
    async (_userId: string, releaseId: string): Promise<VerifyReleaseExistenceResult> => {
        return { exists: await releaseCatalogGateway.releaseExists(releaseId) };
    };
