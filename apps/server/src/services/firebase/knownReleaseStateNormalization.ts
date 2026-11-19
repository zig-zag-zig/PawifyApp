import { isPlainObject } from '../../common/utils/objectGuards.js';
import { normalizeEditionKeywords } from '../../features/releases/domain/releaseEditionKeywords.js';
import type { KnownReleaseGroupStateValue } from '../../features/releases/domain/releaseGroupProcessing.js';
import { assertRtdbKey } from './rtdbKeys.js';

export type KnownReleaseGroupStateMap = {
    [artistId: string]: { [groupId: string]: KnownReleaseGroupStateValue };
};

const normalizeLastNotifiedDate = (value: unknown): string | null =>
    typeof value === 'string' ? value.trim() : null;

const normalizeMaxOfficialTrackCount = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? Math.floor(value)
        : null;

const normalizeStoredKeywords = (value: unknown): string[] =>
    Array.isArray(value)
        ? normalizeEditionKeywords(
              value.filter((keyword): keyword is string => typeof keyword === 'string'),
          )
        : [];

export type StoredKnownReleaseGroupStateValue =
    | string
    | {
          lastNotifiedDate: string | null;
          maxOfficialTrackCount: number | null;
          editionKeywords: string[];
      };

/**
 * Serializes the in-memory state to the RTDB payload.
 *
 * Baselined groups are objects. Unbaselined groups (a settings rebuild or a newly
 * followed artist) keep the historical scalar form so the next read re-marks them
 * and the first scan can baseline silently. The migration-only marker never reaches
 * storage.
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
        payload[trimmed] =
            value.contentBaselined === false
                ? (value.lastNotifiedDate ?? '')
                : {
                      lastNotifiedDate: value.lastNotifiedDate,
                      maxOfficialTrackCount: value.maxOfficialTrackCount,
                      editionKeywords: normalizeEditionKeywords(value.editionKeywords),
                  };
    }

    return payload;
};

/**
 * A legacy value means "known, but the content baseline was never stored".
 *
 * The `contentBaselined: false` marker is intentionally not persisted: the writer
 * strips it, so reading an object back means the baseline exists. Keeping the marker
 * in memory is what makes the first scan silent and the second scan a no-op.
 */
const legacyState = (lastNotifiedDate: string): KnownReleaseGroupStateValue => ({
    lastNotifiedDate,
    maxOfficialTrackCount: null,
    editionKeywords: [],
    contentBaselined: false,
});

const normalizeStateValue = (stored: unknown): KnownReleaseGroupStateValue | null => {
    if (stored === true) {
        return legacyState('');
    }

    if (typeof stored === 'string') {
        return legacyState(stored.trim());
    }

    if (!isPlainObject(stored)) {
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
 * Reads the stored per-group state.
 *
 * Accepts every historical shape:
 * - legacy `true` release-id entries and empty strings (known, no content baseline);
 * - legacy date strings (known, no content baseline);
 * - the current object with `lastNotifiedDate`, `maxOfficialTrackCount` and
 *   `editionKeywords`.
 *
 * Legacy shapes are surfaced with `contentBaselined: false` so the next scan records
 * the current content without notifying.
 */
export const normalizeKnownReleaseGroupState = (
    value: unknown,
): KnownReleaseGroupStateMap => {
    if (!isPlainObject(value)) {
        return {};
    }

    const stateByArtist: KnownReleaseGroupStateMap = {};

    for (const [artistId, groupMap] of Object.entries(value)) {
        assertRtdbKey('artistId', artistId);
        if (!isPlainObject(groupMap)) {
            continue;
        }

        const state: { [groupId: string]: KnownReleaseGroupStateValue } = {};
        for (const [groupId, stored] of Object.entries(groupMap)) {
            assertRtdbKey('groupId', groupId);
            const normalized = normalizeStateValue(stored);
            if (normalized) {
                state[groupId] = normalized;
            }
        }

        stateByArtist[artistId] = state;
    }

    return stateByArtist;
};
