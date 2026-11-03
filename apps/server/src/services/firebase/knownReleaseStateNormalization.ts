import { isPlainObject } from '../../common/utils/objectGuards.js';
import { assertRtdbKey } from './rtdbKeys.js';

export type KnownReleaseGroupStateMap = { [artistId: string]: { [groupId: string]: string } };

/**
 * Reads the stored per-group state.
 *
 * The value is the date of the last notification event for that group. Legacy
 * entries written before the event model are `true`; they are surfaced as an empty
 * string, which means "known, event date unknown" and is baselined without
 * notifying on the next scan.
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

        const state: { [groupId: string]: string } = {};
        for (const [groupId, stored] of Object.entries(groupMap)) {
            assertRtdbKey('groupId', groupId);
            if (stored === true) {
                state[groupId] = '';
                continue;
            }

            if (typeof stored === 'string') {
                state[groupId] = stored.trim();
            }
        }

        stateByArtist[artistId] = state;
    }

    return stateByArtist;
};

