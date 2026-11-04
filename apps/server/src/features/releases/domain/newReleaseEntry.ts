import { formatDate, type ArtistCredit } from '@pawify/shared';

import type { StoredNewRelease } from '../../../services/firebase/types.js';
import type { ReleaseGroupCandidate } from './releaseGroupProcessing.js';

const mapArtistsById = (credits: ArtistCredit[]): { [artistId: string]: string } => {
    const artists: { [artistId: string]: string } = {};
    for (const credit of credits) {
        if (credit.id) {
            artists[credit.id] = credit.name;
        }
    }
    return artists;
};

/**
 * Builds the feed entry for a newly discovered release group.
 *
 * `id` stays a release id (the group's newest pressing) because that is what the
 * release screen and the cover task understand, while `releaseGroupId` is what
 * detection, notification identity and pruning are keyed by. `releaseCount` lets a
 * tap decide between the release screen and the group screen without a second call.
 *
 * Pure on purpose: the entry shape is what other code relies on, and it lives here
 * rather than next to the scan so it can be tested without Firebase.
 */
export const toStoredNewRelease = (
    group: ReleaseGroupCandidate,
    credits: ArtistCredit[],
): StoredNewRelease => ({
    id: group.newestReleaseId,
    title: group.title,
    date: group.date,
    disambiguation: group.disambiguation,
    artists: mapArtistsById(credits),
    date_for_display: formatDate(group.date),
    'primary-type': group.primaryType,
    releaseGroupId: group.id,
    releaseCount: group.releaseIds.length,
});
