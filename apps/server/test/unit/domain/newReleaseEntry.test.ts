import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { toStoredNewRelease } from '../../../src/features/releases/domain/newReleaseEntry.js';
import type { ReleaseGroupCandidate } from '../../../src/features/releases/domain/releaseGroupProcessing.js';

const candidate = (overrides: Partial<ReleaseGroupCandidate> = {}): ReleaseGroupCandidate => ({
    id: 'group-1',
    title: 'Hunger for More',
    date: '2003-04-29',
    disambiguation: '',
    primaryType: 'Album',
    releaseIds: ['release-1', 'release-2'],
    newestReleaseId: 'release-2',
    newestReleaseDate: '2003-04-29',
    ...overrides,
});

describe('toStoredNewRelease', () => {
    it('pairs the group with its newest release id', () => {
        const entry = toStoredNewRelease(candidate(), [
            { id: 'artist-1', name: 'Lloyd Banks', joinphrase: null },
        ]);

        // `id` stays a release id so the release screen and cover tasks work, while
        // the group id is what detection and notifications are keyed by.
        assert.equal(entry.id, 'release-2');
        assert.equal(entry.releaseGroupId, 'group-1');
        assert.equal(entry.releaseCount, 2);
        assert.equal(entry.title, 'Hunger for More');
        assert.equal(entry.date, '2003-04-29');
        assert.equal(entry['primary-type'], 'Album');
        assert.deepEqual(entry.artists, { 'artist-1': 'Lloyd Banks' });
        assert.equal(entry.date_for_display, '29.04.2003');
    });

    it('counts a single-release group as one, so the tap opens the release', () => {
        const entry = toStoredNewRelease(
            candidate({ releaseIds: ['only-release'], newestReleaseId: 'only-release' }),
            [],
        );

        assert.equal(entry.releaseCount, 1);
        assert.equal(entry.id, 'only-release');
    });

    it('keeps an empty artist map rather than inventing a name', () => {
        const entry = toStoredNewRelease(candidate(), []);

        assert.deepEqual(entry.artists, {});
    });

    it('formats a missing date without throwing', () => {
        const entry = toStoredNewRelease(candidate({ date: null }), []);

        assert.equal(entry.date, null);
        assert.equal(typeof entry.date_for_display, 'string');
    });
});
