import type { ArtistReadUseCaseDependencies } from '../ports.js';
import { transientArtistCacheTtlHours } from '../../../services/cache/ttlPolicy.js';

export const createSearchAllUseCase =
    ({ artistSearchGateway, assetPlanner, requestDeduper }: Pick<
        ArtistReadUseCaseDependencies,
        'artistSearchGateway' | 'assetPlanner' | 'requestDeduper'
    >) =>
    async (userId: string, query: string, offset: number, limit: number) => {
        const result = await requestDeduper.run(
            `searchAll:${userId}:${query}:${limit}:${offset}`,
            async () => await Promise.all([
                artistSearchGateway.searchArtists(userId, query, offset, limit),
                artistSearchGateway.searchReleaseGroups(userId, query, offset, limit),
                artistSearchGateway.searchRecordings
                    ? artistSearchGateway.searchRecordings(query, offset, limit)
                    : Promise.resolve({ recordings: [], count: 0 }),
            ]),
        );

        const [artists, releaseGroups, recordings] = result;
        const artistPlan = await assetPlanner.planArtistProfileImages({
            userId,
            scope: `searchAll:${query}:${limit}:${offset}`,
            lookups: artists.artists.map((artist) => ({ artistId: artist.id, artistName: artist.name })),
            ttl: transientArtistCacheTtlHours,
        });
        const releasePlan = await assetPlanner.planArtistReleaseGroupCovers({
            userId,
            scope: `searchAll:${query}:${limit}:${offset}`,
            pageEntries: releaseGroups.releaseGroups.map((group) => ({ releaseGroupId: group.id, releaseIds: [] })),
            ttl: transientArtistCacheTtlHours,
        });

        return {
            artists: artists.artists,
            artistCount: artists.count,
            artistProfileImages: artistPlan.resolved,
            artistProfileImageTaskId: artistPlan.taskId,
            releaseGroups: releaseGroups.releaseGroups,
            releaseGroupCount: releaseGroups.count,
            releaseGroupCovers: releasePlan.resolved,
            releaseGroupCoverTaskId: releasePlan.taskId,
            recordings: recordings.recordings,
            recordingCount: recordings.count,
        };
    };
