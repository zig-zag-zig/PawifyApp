import { rtdb } from '../../infrastructure/firebase/firebaseInit.js';
import { assertRtdbKey } from './rtdbKeys.js';
import {
    buildKnownReleaseGroupStatePayload,
    normalizeKnownReleaseGroupState,
    normalizeKnownReleaseGroupStateWithStatus,
    type KnownReleaseGroupStateMap,
} from './knownReleaseStateNormalization.js';
import type { KnownReleaseGroupStateValue } from '../../features/releases/domain/releaseGroupProcessing.js';

const KNOWN_RELEASES_ROOT = 'knownReleases';

export const getKnownReleaseGroupStateFromDb = async (
    userId: string,
): Promise<KnownReleaseGroupStateMap> => {
    assertRtdbKey('userId', userId);
    const snapshot = await rtdb.ref(`${KNOWN_RELEASES_ROOT}/${userId}`).get();
    return normalizeKnownReleaseGroupState(snapshot.val());
};

export const getKnownReleaseGroupStateWithStatusFromDb = async (
    userId: string,
): Promise<ReturnType<typeof normalizeKnownReleaseGroupStateWithStatus>> => {
    assertRtdbKey('userId', userId);
    const snapshot = await rtdb.ref(`${KNOWN_RELEASES_ROOT}/${userId}`).get();
    return normalizeKnownReleaseGroupStateWithStatus(snapshot.val());
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

export const hasUnmigratedArtistReleaseGroupStateInDb = async (
    userId: string,
    artistId: string,
): Promise<boolean> => {
    assertRtdbKey('userId', userId);
    assertRtdbKey('artistId', artistId);

    const snapshot = await rtdb.ref(`${KNOWN_RELEASES_ROOT}/${userId}/${artistId}`).get();
    return normalizeKnownReleaseGroupStateWithStatus({ [artistId]: snapshot.val() })
        .hasUnmigratedValues;
};

/**
 * Replaces one artist's known groups.
 *
 * Each value carries the last notified event date plus the Official content
 * baseline (maximum track count and edition keywords). An unbaselined migrated
 * group persists `contentBaselined: false` once; the next complete scan fills it.
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

export const deleteKnownArtistReleaseGroupStateFromDb = async (
    userId: string,
    artistId: string,
): Promise<void> => {
    assertRtdbKey('userId', userId);
    assertRtdbKey('artistId', artistId);
    await rtdb.ref(`${KNOWN_RELEASES_ROOT}/${userId}/${artistId}`).remove();
};
