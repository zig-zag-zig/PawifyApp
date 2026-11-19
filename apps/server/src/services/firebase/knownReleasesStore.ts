import { rtdb } from '../../infrastructure/firebase/firebaseInit.js';
import type { ArtistsAndReleasesMap } from './types.js';
import { isPlainObject } from '../../common/utils/objectGuards.js';
import { assertRtdbKey } from './rtdbKeys.js';
import {
    buildKnownReleaseGroupStatePayload,
    normalizeKnownReleaseGroupState,
    type KnownReleaseGroupStateMap,
} from './knownReleaseStateNormalization.js';
import type { KnownReleaseGroupStateValue } from '../../features/releases/domain/releaseGroupProcessing.js';

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

export const getKnownReleaseGroupStateFromDb = async (
    userId: string,
): Promise<KnownReleaseGroupStateMap> => {
    assertRtdbKey('userId', userId);
    const snapshot = await rtdb.ref(`${KNOWN_RELEASES_ROOT}/${userId}`).get();
    return normalizeKnownReleaseGroupState(snapshot.val());
};

export const getKnownArtistReleaseGroupStateFromDb = async (
    userId: string,
    artistId: string,
): Promise<{ [groupId: string]: KnownReleaseGroupStateValue }> => {
    assertRtdbKey('userId', userId);
    assertRtdbKey('artistId', artistId);

    const snapshot = await rtdb.ref(`${KNOWN_RELEASES_ROOT}/${userId}/${artistId}`).get();
    return normalizeKnownReleaseGroupState({ [artistId]: snapshot.val() })[artistId] ?? {};
};

/**
 * Replaces one artist's known groups.
 *
 * Each value carries the last notified event date plus the Official content
 * baseline (maximum track count and edition keywords). The migration-only marker
 * is stripped here, so every object read back from Firebase is a complete baseline.
 */
export const replaceKnownArtistReleaseGroupStateInDb = async (
    userId: string,
    artistId: string,
    state: ReadonlyMap<string, KnownReleaseGroupStateValue>,
): Promise<void> => {
    assertRtdbKey('userId', userId);
    assertRtdbKey('artistId', artistId);

    const payload = buildKnownReleaseGroupStatePayload(state);

    if (Object.keys(payload).length === 0) {
        await rtdb.ref(`${KNOWN_RELEASES_ROOT}/${userId}/${artistId}`).remove();
        return;
    }

    await rtdb.ref(`${KNOWN_RELEASES_ROOT}/${userId}/${artistId}`).set(payload);
};

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
            .filter(([, known]) => known === true || typeof known === 'string')
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

export const deleteKnownArtistReleaseGroupStateFromDb = async (
    userId: string,
    artistId: string,
): Promise<void> => {
    assertRtdbKey('userId', userId);
    assertRtdbKey('artistId', artistId);
    await rtdb.ref(`${KNOWN_RELEASES_ROOT}/${userId}/${artistId}`).remove();
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
