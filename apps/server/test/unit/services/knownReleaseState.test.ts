import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeKnownReleaseGroupState } from '../../../src/services/firebase/knownReleaseStateNormalization.js';

describe('normalizeKnownReleaseGroupState', () => {
    it('keeps event dates for migrated groups', () => {
        const state = normalizeKnownReleaseGroupState({
            'artist-1': { 'group-1': '2026-05-01', 'group-2': '2026-04-01' },
        });

        assert.deepEqual(state['artist-1'], {
            'group-1': '2026-05-01',
            'group-2': '2026-04-01',
        });
    });

    it('treats legacy `true` entries as known with an unknown event date', () => {
        // Pre-migration state was `{ releaseId: true }`. Surfacing '' is what makes
        // the next scan baseline the group instead of notifying about it again.
        const state = normalizeKnownReleaseGroupState({
            'artist-1': { 'release-1': true, 'group-2': '2026-04-01' },
        });

        assert.deepEqual(state['artist-1'], { 'release-1': '', 'group-2': '2026-04-01' });
    });

    it('ignores other value types instead of guessing', () => {
        const state = normalizeKnownReleaseGroupState({
            'artist-1': { 'group-1': 5, 'group-2': null, 'group-3': '2026-01-01' },
        });

        assert.deepEqual(state['artist-1'], { 'group-3': '2026-01-01' });
    });

    it('returns an empty state for a missing or malformed value', () => {
        assert.deepEqual(normalizeKnownReleaseGroupState(null), {});
        assert.deepEqual(normalizeKnownReleaseGroupState('nope'), {});
        // A non-object per-artist value is skipped entirely rather than stored as
        // an empty artist entry.
        assert.deepEqual(normalizeKnownReleaseGroupState({ 'artist-1': 'nope' }), {});
    });
});
