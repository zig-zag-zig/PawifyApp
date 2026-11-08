import type { Release } from '@pawify/shared';
import type { ReleaseReadUseCaseDependencies } from '../ports.js';

export type GetReleaseResult = {
    release: Release;
    profileImageTaskId: string | null;
    profileImages: Record<string, string | null>;
} | null;

export const createGetReleaseUseCase =
    ({
        releaseCatalogGateway,
        assetPlanner,
        requestDeduper,
    }: Pick<
        ReleaseReadUseCaseDependencies,
        'releaseCatalogGateway' | 'assetPlanner' | 'requestDeduper'
    >) =>
    async (userId: string, releaseId: string): Promise<GetReleaseResult> => {
        const release = await requestDeduper.run(
            `getRelease:${releaseId}`,
            async () => await releaseCatalogGateway.getRelease(releaseId),
        );

        if (!release) {
            return null;
        }

        const profileImagesPlan = await assetPlanner.planReleaseArtistProfileImages({
            userId,
            release,
            ttl: undefined,
        });

        return {
            release,
            profileImages: profileImagesPlan.resolved,
            profileImageTaskId: profileImagesPlan.taskId,
        };
    };
