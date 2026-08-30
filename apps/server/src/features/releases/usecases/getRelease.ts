import type { Release } from '../../../modules/models/models.js';
import type { ReleaseReadUseCaseDependencies } from '../ports.js';

type GetReleaseResult = {
    release: Release;
    lyricsTaskId: string | null;
    profileImageTaskId: string | null;
    trackLyrics: Record<string, string | null>;
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

        const [lyricsPlan, profileImagesPlan] = await Promise.all([
            assetPlanner.planReleaseTrackLyrics({ userId, release, ttl: undefined }),
            assetPlanner.planReleaseArtistProfileImages({ userId, release, ttl: undefined }),
        ]);

        return {
            release,
            trackLyrics: lyricsPlan.resolved,
            lyricsTaskId: lyricsPlan.taskId,
            profileImages: profileImagesPlan.resolved,
            profileImageTaskId: profileImagesPlan.taskId,
        };
    };
