import type { ArtistReleaseGroup } from '@pawify/shared';

import { BadRequestError } from '../../../common/http/errors.js';

/**
 * Opaque page cursor for the artist release-group list.
 *
 * Encodes the last group's sort key (`first release date` + id). Keyset paging is
 * used instead of OFFSET because OFFSET re-walks every skipped group, which is why
 * the unpaged contract had to return the whole catalog.
 */
export type ArtistReleasesCursor = {
    sortDate: string | null;
    releaseGroupId: string;
};

const encodePart = (value: string): string =>
    Buffer.from(value, 'utf-8').toString('base64url');

const decodePart = (value: string): string =>
    Buffer.from(value, 'base64url').toString('utf-8');

export const encodeArtistReleasesCursor = (cursor: ArtistReleasesCursor): string =>
    `${encodePart(cursor.sortDate ?? '')}.${encodePart(cursor.releaseGroupId)}`;

export const decodeArtistReleasesCursor = (raw: string): ArtistReleasesCursor => {
    const trimmed = raw.trim();
    // A leading dot is valid: it encodes an undated group (empty sort date), which
    // sorts last. Only a cursor without a separator or without an id is malformed.
    const separator = trimmed.indexOf('.');
    if (separator < 0) {
        throw new BadRequestError('Invalid page cursor');
    }

    const sortDate = decodePart(trimmed.slice(0, separator));
    const releaseGroupId = decodePart(trimmed.slice(separator + 1));
    if (!releaseGroupId) {
        throw new BadRequestError('Invalid page cursor');
    }

    return { sortDate: sortDate.length > 0 ? sortDate : null, releaseGroupId };
};

/** Cursor for the next page: the last group returned. */
export const cursorForLastGroup = (group: ArtistReleaseGroup): ArtistReleasesCursor => ({
    sortDate: group.date ?? null,
    releaseGroupId: group.id,
});
