import { formatDate, type ArtistCredit } from '@pawify/shared';

import type { StoredNewRelease } from '../../../services/firebase/types.js';
import type { ReleaseGroupEvent } from './releaseGroupProcessing.js';

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
 * Builds the feed entry for a new release-group event.
 *
 * `id` stays a release id because that is what the release screen and the cover
 * task understand. It is the edition that caused the event (the newest Official
 * pressing for a new group, the track/keyword carrier for a content event), not an
 * unrelated pressing. `releaseGroupId` remains the detection identity, and
 * `notificationReason`/`trackCount`/`editionKeywords` let the client explain what
 * changed.
 *
 * Pure on purpose: the entry shape is what other code relies on, and it lives here
 * rather than next to the scan so it can be tested without Firebase.
 */
export const toStoredNewRelease = (
    event: ReleaseGroupEvent,
    credits: ArtistCredit[],
): StoredNewRelease => ({
    id: event.edition?.releaseId ?? event.group.newestReleaseId,
    title: event.group.title,
    date: event.date,
    disambiguation: event.group.disambiguation,
    artists: mapArtistsById(credits),
    date_for_display: formatDate(event.date),
    'primary-type': event.group.primaryType,
    releaseGroupId: event.group.id,
    releaseCount: event.group.releaseIds.length,
    trackCount: event.trackCount,
    editionKeywords: event.editionKeywords,
    notificationReason: event.reason,
});