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

        // Seed lyrics that MusicBrainz already answered so the client renders them
        // immediately and the planner only queues Genius for the remaining tracks.
        const knownLyrics: Record<string, string | null> = {};
        for (const media of release.media) {
            for (const track of media.tracks ?? []) {
                if (typeof track.lyricsUrl === 'string' && track.lyricsUrl.trim().length > 0) {
                    knownLyrics[track.id] = track.lyricsUrl;
                }
            }
        }

        const [lyricsPlan, profileImagesPlan] = await Promise.all([
            assetPlanner.planReleaseTrackLyrics({ userId, release, ttl: undefined }),
            assetPlanner.planReleaseArtistProfileImages({ userId, release, ttl: undefined }),
        ]);

        return {
            media: release.media,
            trackLyrics: { ...knownLyrics, ...lyricsPlan.resolved },
            lyricsTaskId: lyricsPlan.taskId,
            profileImages: profileImagesPlan.resolved,
            profileImageTaskId: profileImagesPlan.taskId,
        };
    };
