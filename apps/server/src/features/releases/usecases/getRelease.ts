import type { Release } from '@pawify/shared';
import type { ReleaseReadUseCaseDependencies } from '../ports.js';

export type GetReleaseResult = {
    release: Release;
    trackLyrics: Record<string, string | null>;
    profileImages: Record<string, string | null>;
    lyricsTaskId: string | null;
    profileImageTaskId: string | null;
    releaseCoverTaskId: string | null;
} | null;

/**
 * Loads metadata, all media/tracks and persisted enrichment state in one request.
 *
 * The local mirror read returns the complete tracklist before any provider work.
 * Lyrics/profile-image planning only decides what is already persisted and which
 * provider jobs are still pending; it never blocks the release response on Genius,
 * MusicBrainz lyrics relations or remote artwork.
 */
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

        // One profile-image plan for the header and every track artist. The old
        // split endpoint planned the header and the tracklist separately.
        const [lyricsPlan, profileImagesPlan, coverPlan] = await Promise.all([
            assetPlanner.planReleaseTrackLyrics({ userId, release, ttl: undefined }),
            assetPlanner.planReleaseArtistProfileImages({ userId, release, ttl: undefined }),
            assetPlanner.planReleaseCover({
                userId,
                releaseId: release.id,
                releaseGroupId: release.releaseGroupId,
                ttl: undefined,
            }),
        ]);

        const releaseWithCover = {
            ...release,
            cover_url: coverPlan.resolved[release.id] ?? null,
        };
        const trackLyrics: Record<string, string | null> = { ...lyricsPlan.resolved };
        for (const media of release.media) {
            for (const track of media.tracks ?? []) {
                if (
                    trackLyrics[track.id] === undefined &&
                    typeof track.lyricsUrl === 'string' &&
                    track.lyricsUrl.trim().length > 0
                ) {
                    // Mirror dump relations are usable immediately; they are not
                    // written back into the sync-owned `recording_lyrics` table.
                    trackLyrics[track.id] = track.lyricsUrl;
                }
            }
        }

        return {
            release: releaseWithCover,
            trackLyrics,
            profileImages: profileImagesPlan.resolved,
            lyricsTaskId: lyricsPlan.taskId,
            profileImageTaskId: profileImagesPlan.taskId,
            releaseCoverTaskId: coverPlan.taskId,
        };
    };
