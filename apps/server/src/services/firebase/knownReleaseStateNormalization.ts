import { isPlainObject } from '../../common/utils/objectGuards.js';
import { normalizeEditionKeywords } from '../../features/releases/domain/releaseEditionKeywords.js';
import type { KnownReleaseGroupStateValue } from '../../features/releases/domain/releaseGroupProcessing.js';
import { assertRtdbKey } from './rtdbKeys.js';

export type KnownReleaseGroupStateMap = {
    [artistId: string]: { [groupId: string]: KnownReleaseGroupStateValue };
};

const normalizeLastNotifiedDate = (value: unknown): string | null =>
    (typeof value === 'string' && value.trim()) || null;

const normalizeMaxOfficialTrackCount = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;

const normalizeStoredKeywords = (value: unknown): string[] =>
    Array.isArray(value)
        ? normalizeEditionKeywords(
              value.filter((keyword): keyword is string => typeof keyword === 'string'),
          )
        : [];

export type StoredKnownReleaseGroupStateValue = {
    lastNotifiedDate: string | null;
    maxOfficialTrackCount: number | null;
    editionKeywords: string[];
    /**
     * Canonical migration marker: the group is known but its content baseline has
     * not been computed yet. The first complete scan baselines it silently and
     * writes the object without the marker.
     */
    contentBaselined?: false;
};

/**
 * Serializes the in-memory state to the RTDB payload.
 *
 * Every value is an object. A group that still needs its content baseline persists
 * `contentBaselined: false`, which is the one canonical marker the reader accepts;
 * the first complete scan replaces it with the real baseline and removes the marker.
 */
export const buildKnownReleaseGroupStatePayload = (
    state: ReadonlyMap<string, KnownReleaseGroupStateValue>,
): Record<string, StoredKnownReleaseGroupStateValue> => {
    const payload: Record<string, StoredKnownReleaseGroupStateValue> = {};

    for (const [groupId, value] of state.entries()) {
        const trimmed = groupId.trim();
        if (!trimmed) {
            continue;
        }

        assertRtdbKey('groupId', trimmed);
        payload[trimmed] = {
            // RTDB drops nulls and empty arrays. Keep even an empty baseline.
            lastNotifiedDate: value.lastNotifiedDate ?? '',
            maxOfficialTrackCount: value.maxOfficialTrackCount,
            editionKeywords: normalizeEditionKeywords(value.editionKeywords),
            ...(value.contentBaselined === false ? { contentBaselined: false } : {}),
        };
    }

    return payload;
};

const normalizeStateValue = (stored: unknown): KnownReleaseGroupStateValue | null => {
    if (!isPlainObject(stored)) {
        return null;
    }

    // Missing nullable fields are normal RTDB encoding, not a second wire shape.
    if (
        !Object.keys(stored).some((key) =>
            ['lastNotifiedDate', 'maxOfficialTrackCount', 'editionKeywords', 'contentBaselined'].includes(key),
        ) ||
        !(stored.contentBaselined === undefined || stored.contentBaselined === false) ||
        (stored.lastNotifiedDate != null && typeof stored.lastNotifiedDate !== 'string') ||
        (stored.maxOfficialTrackCount != null &&
            (typeof stored.maxOfficialTrackCount !== 'number' ||
                !Number.isFinite(stored.maxOfficialTrackCount) ||
                stored.maxOfficialTrackCount < 0)) ||
        (stored.editionKeywords !== undefined && !Array.isArray(stored.editionKeywords))
    ) {
        return null;
    }

    return {
        lastNotifiedDate: normalizeLastNotifiedDate(stored.lastNotifiedDate),
        maxOfficialTrackCount: normalizeMaxOfficialTrackCount(stored.maxOfficialTrackCount),
        editionKeywords: normalizeStoredKeywords(stored.editionKeywords),
        ...(stored.contentBaselined === false ? { contentBaselined: false } : {}),
    };
};

/**
 * Reads the canonical stored per-group state (object shape only).
 *
 * Legacy scalar/date shapes must be converted before rollout; the
 * supported runtime does not keep dual-format parsing.
 */
export type NormalizedKnownReleaseGroupState = {
    state: KnownReleaseGroupStateMap;
    /**
     * Artists with at least one non-object value, meaning the one-time canonical
     * migration has not run. Scans must treat those artists' catalogues as
     * incomplete: emitting or pruning from a partially-read known set would
     * re-notify history or delete it.
     */
    hasUnmigratedValues: boolean;
    unmigratedArtistIds: string[];
};

export const normalizeKnownReleaseGroupStateWithStatus = (
    value: unknown,
): NormalizedKnownReleaseGroupState => {
    if (!isPlainObject(value)) {
        return { state: {}, hasUnmigratedValues: false, unmigratedArtistIds: [] };
    }

    const stateByArtist: KnownReleaseGroupStateMap = {};
    const unmigratedArtistIds: string[] = [];

    for (const [artistId, groupMap] of Object.entries(value)) {
        assertRtdbKey('artistId', artistId);
        if (!isPlainObject(groupMap)) {
            if (groupMap !== null && groupMap !== undefined) {
                unmigratedArtistIds.push(artistId);
            }
            continue;
        }

        const state: { [groupId: string]: KnownReleaseGroupStateValue } = {};
        for (const [groupId, stored] of Object.entries(groupMap)) {
            assertRtdbKey('groupId', groupId);
            const normalized = normalizeStateValue(stored);
            if (normalized) {
                state[groupId] = normalized;
            } else if (!unmigratedArtistIds.includes(artistId)) {
                unmigratedArtistIds.push(artistId);
            }
        }

        stateByArtist[artistId] = state;
    }

    return {
        state: stateByArtist,
        hasUnmigratedValues: unmigratedArtistIds.length > 0,
        unmigratedArtistIds,
    };
};

export const normalizeKnownReleaseGroupState = (value: unknown): KnownReleaseGroupStateMap =>
    normalizeKnownReleaseGroupStateWithStatus(value).state;
