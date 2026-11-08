import type { Media } from '@pawify/shared';
import type { ReleaseReadUseCaseDependencies } from '../ports.js';

export type GetReleaseTracksResult = {
    media: Media[];
    lyricsTaskId: string | null;
    profileImageTaskId: string | null;
    trackLyrics: Record<string, string | null>;
    profileImages: Record<string, string | null>;
} | null;

export const createGetReleaseTracksUseCase =
    ({
        releaseCatalogGateway,
        assetPlanner,
        requestDeduper,
    }: Pick<
        ReleaseReadUseCaseDependencies,
        'releaseCatalogGateway' | 'assetPlanner' | 'requestDeduper'
    >) =>
    async (userId: string, releaseId: string): Promise<GetReleaseTracksResult> => {
        const release = await requestDeduper.run(
            `getReleaseTracks:${releaseId}`,
            async () => await releaseCatalogGateway.getReleaseTracks(releaseId),
        );

        if (!release) {
            return null;
        }

        const [lyricsPlan, profileImagesPlan] = await Promise.all([
            assetPlanner.planReleaseTrackLyrics({ userId, release, ttl: undefined }),
            assetPlanner.planReleaseArtistProfileImages({ userId, release, ttl: undefined }),
        ]);

        return {
            media: release.media,
            trackLyrics: lyricsPlan.resolved,
            lyricsTaskId: lyricsPlan.taskId,
            profileImages: profileImagesPlan.resolved,
            profileImageTaskId: profileImagesPlan.taskId,
        };
    };
