import {
    queueArtistProfileImagesTask,
    withTaskKeyNamespace,
} from '../../services/backgroundTaskWorkers.js';
import { addTaskUser } from '../../services/taskService.js';
import { transientArtistCacheTtlHours } from '../../services/cache/ttlPolicy.js';
import type {
    ArtistProfileImageLookup,
    ArtistProfileImageQueueOptions,
} from '../../utils/types/taskTypes.js';

export interface ArtistProfileImageTaskQueue {
    queueArtistProfileImages(
        userId: string,
        scope: string,
        artistIds: string[],
        ttl: number | undefined,
        options?: ArtistProfileImageQueueOptions,
    ): string;
    queueArtistProfileImagesWithLookups(
        userId: string,
        scope: string,
        artistLookups: ArtistProfileImageLookup[],
        ttl: number | undefined,
        options?: ArtistProfileImageQueueOptions,
    ): string;
}

const getProfileImageDedupeKey = (scope: string, artistIds: string[]): string => {
    const uniqueSorted = Array.from(new Set(artistIds))
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right));

    return `artist_profile_images:${scope}:${uniqueSorted.join(',')}`;
};

export const artistProfileImageTaskQueue: ArtistProfileImageTaskQueue = {
    queueArtistProfileImages: (
        userId: string,
        scope: string,
        artistIds: string[],
        ttl: number | undefined,
        options?: ArtistProfileImageQueueOptions,
    ): string =>
        queueArtistProfileImagesInternal(
            userId,
            scope,
            artistIds.map((artistId) => ({ artistId })),
            ttl,
            options,
        ),
    queueArtistProfileImagesWithLookups: (
        userId: string,
        scope: string,
        artistLookups: ArtistProfileImageLookup[],
        ttl: number | undefined,
        options?: ArtistProfileImageQueueOptions,
    ): string => queueArtistProfileImagesInternal(userId, scope, artistLookups, ttl, options),
};

const queueArtistProfileImagesInternal = (
    userId: string,
    scope: string,
    artistLookups: ArtistProfileImageLookup[],
    ttl: number | undefined,
    options?: ArtistProfileImageQueueOptions,
): string => {
    const effectiveTtl = ttl ?? transientArtistCacheTtlHours;
    const normalizedArtistLookups = Array.from(
        artistLookups
            .reduce((map, lookup) => {
                if (!lookup.artistId) {
                    return map;
                }

                const existing = map.get(lookup.artistId);
                map.set(lookup.artistId, {
                    artistId: lookup.artistId,
                    artistName: lookup.artistName ?? existing?.artistName,
                    discogsUrls: lookup.discogsUrls ?? existing?.discogsUrls,
                });
                return map;
            }, new Map<string, ArtistProfileImageLookup>())
            .values(),
    );
    const uniqueArtistIds =
        options?.fullArtistIds ?? normalizedArtistLookups.map((lookup) => lookup.artistId);
    const taskId = queueArtistProfileImagesTask(
        userId,
        withTaskKeyNamespace(
            options?.contractNamespace,
            getProfileImageDedupeKey(scope, uniqueArtistIds),
        ),
        normalizedArtistLookups,
        effectiveTtl,
    );

    addTaskUser(taskId, userId);
    return taskId;
};
