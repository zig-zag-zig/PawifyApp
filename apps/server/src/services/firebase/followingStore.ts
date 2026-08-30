import type { FollowedArtistSummary } from '../../utils/types/followedArtistTypes.js';
import { FollowedArtistsMap, FollowingArtistDocument, FollowingArtistsMap } from './types.js';
import { getFollowingMapDocRef, buildFollowingCollectionPayload } from './refs.js';
import { isPlainObject } from '../../common/utils/objectGuards.js';
import { monitorUserMapsDocSizes } from '../monitoring/mapsDocSizeMonitor.js';
import { getDocumentRefAndSnapshot } from './userStore.js';

const normalizeFollowedArtistSummary = (
    artistId: string,
    value: unknown,
): FollowedArtistSummary | null => {
    if (!isPlainObject(value)) {
        return null;
    }

    const summaryId = typeof value.id === 'string' ? value.id : artistId;
    if (summaryId !== artistId) {
        return null;
    }

    if (typeof value.name !== 'string' || !value.name.trim()) {
        return null;
    }

    const refreshedAt = typeof value.refreshedAt === 'number' ? value.refreshedAt : undefined;

    return {
        id: summaryId,
        name: value.name,
        refreshedAt,
    };
};

const normalizeFollowingDocument = (
    artistId: string,
    value: unknown,
): FollowingArtistDocument | null => {
    if (!isPlainObject(value)) {
        return null;
    }

    const summary = normalizeFollowedArtistSummary(artistId, value);
    if (!summary) {
        return null;
    }

    const updatedAt = typeof value.updatedAt === 'number' ? value.updatedAt : Date.now();

    return {
        ...summary,
        updatedAt,
    };
};

const normalizeFollowingArtistsMap = (value: unknown): FollowingArtistsMap => {
    if (!isPlainObject(value)) {
        return {};
    }

    const artistsMap: FollowingArtistsMap = {};

    for (const [artistId, entry] of Object.entries(value)) {
        const normalized = normalizeFollowingDocument(artistId, entry);
        if (normalized) {
            artistsMap[artistId] = normalized;
        }
    }

    return artistsMap;
};

const normalizeFollowingCollectionDocument = (value: unknown): FollowingArtistsMap | null => {
    if (!isPlainObject(value)) {
        return null;
    }

    return normalizeFollowingArtistsMap(value);
};

export const writeFollowingArtistsMap = async (
    userId: string,
    artistsMap: FollowingArtistsMap,
): Promise<void> => {
    await getFollowingMapDocRef(userId).set(buildFollowingCollectionPayload(artistsMap));
};

export const readFollowingArtistsMap = async (userId: string): Promise<FollowingArtistsMap> => {
    const mapDoc = await getFollowingMapDocRef(userId).get();
    const normalizedMapDoc = normalizeFollowingCollectionDocument(mapDoc.data());

    // Opportunistic monitoring of maps doc size
    monitorUserMapsDocSizes(userId).catch(() => {});

    if (normalizedMapDoc) {
        return normalizedMapDoc;
    }

    return {};
};

export const getFollowingFromDb = async (userId: string): Promise<string[]> => {
    const followingArtistsMap = await readFollowingArtistsMap(userId);
    return Object.keys(followingArtistsMap);
};

export const getFollowingStateFromDb = async (
    userId: string,
): Promise<{ artistIds: string[]; artistSummaries: FollowedArtistsMap }> => {
    const followingArtistsMap = await readFollowingArtistsMap(userId);
    const artistIds = Object.keys(followingArtistsMap);

    const artistSummaries = artistIds.reduce<FollowedArtistsMap>((acc, artistId) => {
        const doc = followingArtistsMap[artistId];
        if (!doc) {
            return acc;
        }

        acc[artistId] = {
            id: artistId,
            name: doc.name,
            refreshedAt: doc.refreshedAt,
        };
        return acc;
    }, {});

    return {
        artistIds,
        artistSummaries,
    };
};

export const saveFollowingArtistSummariesToDb = async (
    userId: string,
    artistSummaries: FollowedArtistSummary[],
): Promise<void> => {
    const uniqueArtistSummaries = Array.from(
        new Map(artistSummaries.map((artist) => [artist.id, artist])).values(),
    );

    if (uniqueArtistSummaries.length === 0) {
        return;
    }

    await getDocumentRefAndSnapshot(userId);

    const followingArtistsMap = await readFollowingArtistsMap(userId);
    let changed = false;

    for (const artist of uniqueArtistSummaries) {
        const existing = followingArtistsMap[artist.id];
        if (!existing) {
            continue;
        }

        followingArtistsMap[artist.id] = {
            ...existing,
            name: artist.name,
            refreshedAt: artist.refreshedAt,
            updatedAt: Date.now(),
        };
        changed = true;
    }

    if (changed) {
        await writeFollowingArtistsMap(userId, followingArtistsMap);
    }
};
