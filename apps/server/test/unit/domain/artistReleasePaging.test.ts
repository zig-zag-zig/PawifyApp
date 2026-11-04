import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    cursorForLastGroup,
    decodeArtistReleasesCursor,
    encodeArtistReleasesCursor,
} from '../../../src/features/releases/domain/artistReleasePaging.js';

const group = (id: string, date: string | null) => ({
    id,
    title: `Group ${id}`,
    date,
    disambiguation: null,
    'primary-type': 'Album',
    releaseIds: [`release-${id}`],
});

describe('artist release-group cursor', () => {
    it('round-trips a dated group', () => {
        const cursor = cursorForLastGroup(group('group-1', '2026-05-01'));

        assert.deepEqual(decodeArtistReleasesCursor(encodeArtistReleasesCursor(cursor)), cursor);
    });

    it('round-trips an undated group', () => {
        // Groups without a date sort last, so the cursor has to represent "no date".
        const cursor = cursorForLastGroup(group('group-1', null));

        assert.deepEqual(decodeArtistReleasesCursor(encodeArtistReleasesCursor(cursor)), {
            sortDate: null,
            releaseGroupId: 'group-1',
        });
    });

    it('stays opaque through base64url, including group ids with dashes', () => {
        const encoded = encodeArtistReleasesCursor({
            sortDate: '2026-05-01',
            releaseGroupId: 'e6db15f5-6c21-7a60-c232-3b7e5d6b3d04',
        });

        assert.equal(encoded.includes('='), false);
        assert.equal(decodeArtistReleasesCursor(encoded).releaseGroupId, 'e6db15f5-6c21-7a60-c232-3b7e5d6b3d04');
    });

    it('rejects a malformed cursor instead of returning page one silently', () => {
        // Silently restarting at page one would loop the client forever.
        assert.throws(() => decodeArtistReleasesCursor('nonsense'), /Invalid page cursor/);
        assert.throws(() => decodeArtistReleasesCursor(''), /Invalid page cursor/);
        assert.throws(() => decodeArtistReleasesCursor('abc.'), /Invalid page cursor/);
    });
});
