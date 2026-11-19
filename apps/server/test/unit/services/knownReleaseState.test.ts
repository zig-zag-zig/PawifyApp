import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    buildKnownReleaseGroupStatePayload,
    normalizeKnownReleaseGroupState,
    normalizeKnownReleaseGroupStateWithStatus,
} from '../../../src/services/firebase/knownReleaseStateNormalization.js';
import { planArtistScan } from '../../../src/features/releases/domain/releaseGroupProcessing.js';

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

    it('ignores legacy scalar shapes but reports the artist as unmigrated', () => {
        const result = normalizeKnownReleaseGroupStateWithStatus({
            'artist-1': { 'release-1': true, 'group-2': '2026-04-01', 'group-3': '' },
            'artist-2': {
                'group-1': {
                    lastNotifiedDate: '2026-05-01',
                    maxOfficialTrackCount: 12,
                    editionKeywords: [],
                },
            },
        });

        assert.deepEqual(result.state['artist-1'], {});
        assert.equal(result.state['artist-2']?.['group-1']?.maxOfficialTrackCount, 12);
        assert.deepEqual(result.unmigratedArtistIds, ['artist-1']);
        assert.equal(result.hasUnmigratedValues, true);
    });

    it('does not notify or prune an artist whose state is not migrated', () => {
        const result = normalizeKnownReleaseGroupStateWithStatus({
            'artist-1': { 'release-1': true },
        });
        const catalog = [
            {
                id: 'group-1',
                title: 'Album',
                date: '2026-01-01',
                disambiguation: '',
                primaryType: 'Album',
                releaseIds: ['release-1'],
                newestReleaseId: 'release-1',
                newestReleaseDate: '2026-01-01',
                officialEditions: [
                    {
                        releaseId: 'release-1',
                        date: '2026-01-01',
                        status: 'Official',
                        trackCount: 12,
                        formats: ['CD'],
                        title: 'Album',
                        disambiguation: null,
                        editionKeywords: [],
                    },
                ],
            },
        ];

        const plan = planArtistScan(
            new Map(Object.entries(result.state['artist-1'] ?? {})),
            catalog,
            { oldestReleaseDateMonths: null, includeReleasesWithoutDate: true },
            new Date('2026-06-01'),
            !result.unmigratedArtistIds.includes('artist-1'),
        );

        assert.deepEqual(plan.newEvents, []);
        assert.deepEqual(plan.prunedGroupIds, []);
        assert.equal(plan.groupsChanged, false);
    });

    it('marks partial object values as unmigrated instead of inventing content', () => {
        const result = normalizeKnownReleaseGroupStateWithStatus({
            'artist-1': {
                'group-1': {
                    lastNotifiedDate: ' 2026-05-01 ',
                    maxOfficialTrackCount: -3,
                    editionKeywords: ['deluxe', 'deluxe'],
                },
            },
        });

        assert.deepEqual(result.state['artist-1'], {});
        assert.deepEqual(result.unmigratedArtistIds, ['artist-1']);
    });

    it('ignores other value types instead of guessing', () => {
        const state = normalizeKnownReleaseGroupState({
            'artist-1': {
                'group-1': 5,
                'group-2': null,
            },
        });

        assert.deepEqual(state['artist-1'], {});
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

    it('keeps an unbaselined group as an object with the canonical marker', () => {
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

        assert.deepEqual(payload, {
            'group-1': {
                lastNotifiedDate: '',
                maxOfficialTrackCount: null,
                editionKeywords: [],
                contentBaselined: false,
            },
        });
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
