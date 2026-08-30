import { rtdb } from '../../infrastructure/firebase/firebaseInit.js';
import type { ArtistsAndReleasesMap } from './types.js';
import { isPlainObject } from '../../common/utils/objectGuards.js';
import { assertRtdbKey } from './rtdbKeys.js';

const KNOWN_RELEASES_ROOT = 'knownReleases';

const normalizeReleaseIds = (releaseIds: string[]): string[] =>
    Array.from(
        new Set(
            releaseIds.flatMap((releaseId) => {
                const trimmedReleaseId = releaseId.trim();
                if (!trimmedReleaseId) {
                    return [];
                }

                assertRtdbKey('releaseId', trimmedReleaseId);
                return [trimmedReleaseId];
            }),
        ),
    );

const normalizeKnownReleases = (value: unknown): ArtistsAndReleasesMap => {
    if (!isPlainObject(value)) {
        return {};
    }

    const releasesByArtist: ArtistsAndReleasesMap = {};

    for (const [artistId, releaseMap] of Object.entries(value)) {
        assertRtdbKey('artistId', artistId);
        if (!isPlainObject(releaseMap)) {
            continue;
        }

        const releaseIds = Object.entries(releaseMap)
            .filter(([, known]) => known === true)
            .map(([releaseId]) => {
                assertRtdbKey('releaseId', releaseId);
                return releaseId;
            });

        if (releaseIds.length > 0) {
            releasesByArtist[artistId] = releaseIds;
        }
    }

    return releasesByArtist;
};

export const getKnownReleasesFromDb = async (userId: string): Promise<ArtistsAndReleasesMap> => {
    assertRtdbKey('userId', userId);
    const snapshot = await rtdb.ref(`${KNOWN_RELEASES_ROOT}/${userId}`).get();
    return normalizeKnownReleases(snapshot.val());
};

export const getKnownArtistReleaseIdsFromDb = async (
    userId: string,
    artistId: string,
): Promise<string[]> => {
    assertRtdbKey('userId', userId);
    assertRtdbKey('artistId', artistId);

    const snapshot = await rtdb.ref(`${KNOWN_RELEASES_ROOT}/${userId}/${artistId}`).get();
    const normalized = normalizeKnownReleases({ [artistId]: snapshot.val() });
    return normalized[artistId] ?? [];
};

export const replaceKnownArtistReleaseIdsInDb = async (
    userId: string,
    artistId: string,
    releaseIds: string[],
): Promise<void> => {
    assertRtdbKey('userId', userId);
    assertRtdbKey('artistId', artistId);

    const uniqueReleaseIds = normalizeReleaseIds(releaseIds);
    const releasesMap = Object.fromEntries(uniqueReleaseIds.map((releaseId) => [releaseId, true]));
    await rtdb.ref(`${KNOWN_RELEASES_ROOT}/${userId}/${artistId}`).set(releasesMap);
};

export const mergeKnownArtistReleaseIdsInDb = async (
    userId: string,
    artistId: string,
    releaseIds: string[],
): Promise<void> => {
    assertRtdbKey('userId', userId);
    assertRtdbKey('artistId', artistId);

    const uniqueReleaseIds = normalizeReleaseIds(releaseIds);
    if (uniqueReleaseIds.length === 0) {
        return;
    }

    const updates = Object.fromEntries(
        uniqueReleaseIds.map((releaseId) => [
            `${KNOWN_RELEASES_ROOT}/${userId}/${artistId}/${releaseId}`,
            true,
        ]),
    );
    await rtdb.ref().update(updates);
};

export const deleteKnownArtistReleasesFromDb = async (
    userId: string,
    artistId: string,
): Promise<void> => {
    assertRtdbKey('userId', userId);
    assertRtdbKey('artistId', artistId);
    await rtdb.ref(`${KNOWN_RELEASES_ROOT}/${userId}/${artistId}`).remove();
};

export const removeKnownReleaseFromAllUsers = async (releaseId: string): Promise<string[]> => {
    assertRtdbKey('releaseId', releaseId);

    const snapshot = await rtdb.ref(KNOWN_RELEASES_ROOT).get();
    const allKnownReleases = snapshot.val();
    if (!isPlainObject(allKnownReleases)) {
        return [];
    }

    const updates: Record<string, null> = {};
    const affectedUserIds = new Set<string>();

    for (const [userId, userKnownReleases] of Object.entries(allKnownReleases)) {
        assertRtdbKey('userId', userId);
        if (!isPlainObject(userKnownReleases)) {
            continue;
        }

        for (const [artistId, releaseMap] of Object.entries(userKnownReleases)) {
            assertRtdbKey('artistId', artistId);
            if (!isPlainObject(releaseMap) || releaseMap[releaseId] !== true) {
                continue;
            }

            updates[`${KNOWN_RELEASES_ROOT}/${userId}/${artistId}/${releaseId}`] = null;
            affectedUserIds.add(userId);
        }
    }

    if (Object.keys(updates).length > 0) {
        await rtdb.ref().update(updates);
    }

    return Array.from(affectedUserIds);
};
