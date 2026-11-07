import type { ArtistReadUseCaseDependencies } from '../ports.js';
import { transientArtistCacheTtlHours } from '../../../services/cache/ttlPolicy.js';

export const createSearchAllUseCase =
    ({ artistSearchGateway, assetPlanner, requestDeduper }: Pick<
        ArtistReadUseCaseDependencies,
        'artistSearchGateway' | 'assetPlanner' | 'requestDeduper'
    >) =>
    async (
        userId: string,
        query: string,
        offset: number,
        limit: number,
        category?: 'artists' | 'releaseGroups' | 'tracks',
    ) => {
        const result = await requestDeduper.run(
            `searchAll:${userId}:${query}:${limit}:${offset}:${category ?? 'all'}`,
            async () => await Promise.all([
                !category || category === 'artists'
                    ? artistSearchGateway.searchArtists(userId, query, offset, limit)
                    : Promise.resolve({ artists: [], count: 0 }),
                !category || category === 'releaseGroups'
                    ? artistSearchGateway.searchReleaseGroups(userId, query, offset, limit)
                    : Promise.resolve({ releaseGroups: [], count: 0 }),
                (!category || category === 'tracks') && artistSearchGateway.searchRecordings
                    ? artistSearchGateway.searchRecordings(query, offset, limit)
                    : Promise.resolve({ recordings: [], count: 0 }),
            ]),
        );

        const [artists, releaseGroups, recordings] = result;
        const scopeSuffix = category ?? 'all';
        const artistPlan = await assetPlanner.planArtistProfileImages({
            userId,
            scope: `searchAll:${query}:${limit}:${offset}:${scopeSuffix}`,
            lookups: artists.artists.map((artist) => ({ artistId: artist.id, artistName: artist.name })),
            ttl: transientArtistCacheTtlHours,
        });
        const releasePlan = await assetPlanner.planArtistReleaseGroupCovers({
            userId,
            scope: `searchAll:${query}:${limit}:${offset}:${scopeSuffix}`,
            pageEntries: releaseGroups.releaseGroups.map((group) => ({ releaseGroupId: group.id, releaseIds: [] })),
            ttl: transientArtistCacheTtlHours,
        });

        // Track results have no artwork of their own, so the release each recording
        // sits on is resolved through the same release-cover task: one grouped plan
        // for the whole page instead of a lookup per track.
        const trackReleasesByGroup = new Map<string, string[]>();
        for (const recording of recordings.recordings) {
            const release = recording.release;
            if (!release?.releaseGroupId) {
                continue;
            }

            const releaseIds = trackReleasesByGroup.get(release.releaseGroupId) ?? [];
            releaseIds.push(release.id);
            trackReleasesByGroup.set(release.releaseGroupId, releaseIds);
        }

        const trackCoverPlan =
            trackReleasesByGroup.size === 0
                ? { resolved: {}, taskId: null }
                : await assetPlanner.planReleaseGroupReleaseCovers({
                      userId,
                      releaseGroupId: `searchAll:${query}:${limit}:${offset}:${scopeSuffix}`,
                      pageEntries: Array.from(trackReleasesByGroup, ([releaseGroupId, releaseIds]) => ({
                          releaseGroupId,
                          releaseIds,
                      })),
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
            releaseCovers: trackCoverPlan.resolved,
            releaseCoverTaskId: trackCoverPlan.taskId,
        };
    };
