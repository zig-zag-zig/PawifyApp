import type { Media } from '@pawify/shared';
import { createLogger } from '../../../common/logging/logger.js';
import { assetKeys, writeAssetState } from '../../../services/cache/assetCache.js';
import { mapLyricsToState } from '../../../services/tasks/backgroundTaskMappers.js';
import type { ReleaseReadUseCaseDependencies } from '../ports.js';

const logger = createLogger('features.releases.getReleaseTracks');

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

        // Record the MusicBrainz answers in the lyrics cache too, so a later request
        // that only reads `asset:lyrics:*` still sees them.
        for (const [trackId, lyricsUrl] of Object.entries(knownLyrics)) {
            if (typeof lyricsUrl === 'string' && lyricsUrl.length > 0) {
                void writeAssetState(
                    assetKeys.trackLyrics(releaseId, trackId),
                    mapLyricsToState(lyricsUrl),
                ).catch((error) => {
                    logger.debug('musicbrainz lyrics cache write failed', { trackId, error });
                });
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
