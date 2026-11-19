import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeKnownReleaseGroupState, buildKnownReleaseGroupStatePayload } from '../../../src/services/firebase/knownReleaseStateNormalization.js';

describe('normalizeKnownReleaseGroupState', () => {
    it('keeps the current object state', () => {
        const state = normalizeKnownReleaseGroupState({
            'artist-1': {
                'group-1': {
                    lastNotifiedDate: '2026-05-01',
                    maxOfficialTrackCount: 15,
                    editionKeywords: ['deluxe'],
                },
            },
        });

        assert.deepEqual(state['artist-1'], {
            'group-1': {
                lastNotifiedDate: '2026-05-01',
                maxOfficialTrackCount: 15,
                editionKeywords: ['deluxe'],
            },
        });
    });

    it('treats legacy `true` entries as known with an unknown event date', () => {
        // Pre-migration state was `{ releaseId: true }`. The marker makes the next
        // scan baseline the content instead of notifying about it again.
        const state = normalizeKnownReleaseGroupState({
            'artist-1': { 'release-1': true, 'group-2': '2026-04-01' },
        });

        assert.deepEqual(state['artist-1'], {
            'release-1': {
                lastNotifiedDate: '',
                maxOfficialTrackCount: null,
                editionKeywords: [],
                contentBaselined: false,
            },
            'group-2': {
                lastNotifiedDate: '2026-04-01',
                maxOfficialTrackCount: null,
                editionKeywords: [],
                contentBaselined: false,
            },
        });
    });

    it('treats an empty-string value as a silently baselined migrated group', () => {
        const state = normalizeKnownReleaseGroupState({ 'artist-1': { 'group-1': '' } });

        assert.deepEqual(state['artist-1']?.['group-1'], {
            lastNotifiedDate: '',
            maxOfficialTrackCount: null,
            editionKeywords: [],
            contentBaselined: false,
        });
    });

    it('normalizes partial object values without inventing content', () => {
        const state = normalizeKnownReleaseGroupState({
            'artist-1': {
                'group-1': {
                    lastNotifiedDate: ' 2026-05-01 ',
                    maxOfficialTrackCount: -3,
                    editionKeywords: ['deluxe', 'deluxe', 'not-a-keyword', 5],
                },
            },
        });

        assert.deepEqual(state['artist-1']?.['group-1'], {
            lastNotifiedDate: '2026-05-01',
            maxOfficialTrackCount: null,
            editionKeywords: ['deluxe'],
        });
    });

    it('ignores other value types instead of guessing', () => {
        const state = normalizeKnownReleaseGroupState({
            'artist-1': {
                'group-1': 5,
                'group-2': null,
                'group-3': '2026-01-01',
            },
        });

        assert.deepEqual(state['artist-1'], {
            'group-3': {
                lastNotifiedDate: '2026-01-01',
                maxOfficialTrackCount: null,
                editionKeywords: [],
                contentBaselined: false,
            },
        });
    });

    it('returns an empty state for a missing or malformed value', () => {
        assert.deepEqual(normalizeKnownReleaseGroupState(null), {});
        assert.deepEqual(normalizeKnownReleaseGroupState('nope'), {});
        // A non-object per-artist value is skipped entirely rather than stored as
        // an empty artist entry.
        assert.deepEqual(normalizeKnownReleaseGroupState({ 'artist-1': 'nope' }), {});
    });

    it('is idempotent for the current object shape', () => {
        const once = normalizeKnownReleaseGroupState({
            'artist-1': {
                'group-1': {
                    lastNotifiedDate: '2026-05-01',
                    maxOfficialTrackCount: 15,
                    editionKeywords: ['deluxe'],
                },
            },
        });
        const twice = normalizeKnownReleaseGroupState(once);

        assert.deepEqual(twice, once);
    });
});

describe('buildKnownReleaseGroupStatePayload', () => {
    it('writes a baselined group as an object without the migration marker', () => {
        const payload = buildKnownReleaseGroupStatePayload(
            new Map([
                [
                    'group-1',
                    {
                        lastNotifiedDate: '2026-05-01',
                        maxOfficialTrackCount: 15,
                        editionKeywords: ['deluxe'],
                    },
                ],
            ]),
        );

        assert.deepEqual(payload, {
            'group-1': {
                lastNotifiedDate: '2026-05-01',
                maxOfficialTrackCount: 15,
                editionKeywords: ['deluxe'],
            },
        });
        assert.equal('contentBaselined' in (payload['group-1'] as object), false);
    });

    it('keeps an unbaselined group in the scalar form so the next scan stays silent', () => {
        const payload = buildKnownReleaseGroupStatePayload(
            new Map([
                [
                    'group-1',
                    {
                        lastNotifiedDate: '',
                        maxOfficialTrackCount: null,
                        editionKeywords: [],
                        contentBaselined: false,
                    },
                ],
            ]),
        );

        assert.deepEqual(payload, { 'group-1': '' });
    });

    it('round-trips an unbaselined group as unbaselined', () => {
        const payload = buildKnownReleaseGroupStatePayload(
            new Map([
                [
                    'group-1',
                    {
                        lastNotifiedDate: '2026-05-01',
                        maxOfficialTrackCount: null,
                        editionKeywords: [],
                        contentBaselined: false,
                    },
                ],
            ]),
        );
        const normalized = normalizeKnownReleaseGroupState({ 'artist-1': payload });

        assert.equal(normalized['artist-1']?.['group-1']?.contentBaselined, false);
    });
});