import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    migrateKnownArtistState,
    migrateNewReleasesMap,
    parseLegacyDisplayDate,
    parseLegacyKnownValue,
} from '../../../src/services/firebase/canonicalStateMigration.js';
import type { ReleaseGroupCandidate } from '../../../src/features/releases/domain/releaseGroupProcessing.js';

const group = (): ReleaseGroupCandidate => ({
    id: 'group-1',
    title: 'Album',
    date: '2024-01-01',
    disambiguation: '',
    primaryType: 'Album',
    releaseIds: ['release-1', 'release-2'],
    newestReleaseId: 'release-2',
    newestReleaseDate: '2024-01-01',
    officialEditions: [
        {
            releaseId: 'release-2',
            date: '2024-01-01',
            status: 'Official',
            trackCount: 12,
            formats: ['CD'],
            title: 'Album',
            disambiguation: null,
            editionKeywords: ['deluxe'],
        },
    ],
});

describe('canonical state migration helpers', () => {
    it('parses legacy known-value shapes and detects missing baselines', () => {
        assert.deepEqual(parseLegacyKnownValue(true), {
            lastNotifiedDate: '',
            maxOfficialTrackCount: null,
            editionKeywords: [],
            needsBaseline: true,
        });
        assert.equal(parseLegacyKnownValue('2024-01-01')?.needsBaseline, true);
        assert.equal(
            parseLegacyKnownValue({
                lastNotifiedDate: '2024-01-01',
                maxOfficialTrackCount: 10,
                editionKeywords: ['deluxe'],
            })?.needsBaseline,
            false,
        );
        assert.equal(
            parseLegacyKnownValue({
                lastNotifiedDate: '2024-01-01',
                maxOfficialTrackCount: null,
                editionKeywords: [],
            })?.needsBaseline,
            false,
        );
        assert.equal(parseLegacyKnownValue(5), null);
        assert.equal(
            parseLegacyKnownValue({
                lastNotifiedDate: '2024-01-01',
                maxOfficialTrackCount: 10,
                editionKeywords: [],
                contentBaselined: false,
            })?.needsBaseline,
            true,
        );
    });

    it('parses legacy display dates without losing precision', () => {
        assert.equal(parseLegacyDisplayDate('14.03.2025'), '2025-03-14');
        assert.equal(parseLegacyDisplayDate('03.2025'), '2025-03');
        assert.equal(parseLegacyDisplayDate('2025'), '2025');
        assert.equal(parseLegacyDisplayDate('not a date'), null);
    });

    it('maps release-id keys to groups and computes the current baseline', () => {
        const migrated = migrateKnownArtistState({
            rawGroups: { 'release-1': true, 'release-2': '2024-02-01' },
            releaseToGroup: new Map([
                ['release-1', 'group-1'],
                ['release-2', 'group-1'],
            ]),
            groupsById: new Map([['group-1', group()]]),
            catalogComplete: true,
        });

        assert.equal(migrated.resolvedFromReleaseIds, 2);
        assert.deepEqual(migrated.unparsedKeys, []);
        assert.deepEqual(migrated.state.get('group-1'), {
            lastNotifiedDate: '2024-02-01',
            maxOfficialTrackCount: 12,
            editionKeywords: ['deluxe'],
        });
    });

    it('marks the baseline missing when the catalogue is incomplete', () => {
        const migrated = migrateKnownArtistState({
            rawGroups: { 'release-1': true },
            releaseToGroup: new Map([['release-1', 'group-1']]),
            groupsById: new Map([['group-1', group()]]),
            catalogComplete: false,
        });

        assert.equal(migrated.state.get('group-1')?.contentBaselined, false);
        assert.equal(migrated.state.get('group-1')?.maxOfficialTrackCount, null);
    });

    it('reports unparseable entries instead of dropping them silently', () => {
        const migrated = migrateKnownArtistState({
            rawGroups: { 'group-1': true, 'group-2': 7 },
            releaseToGroup: new Map(),
            groupsById: new Map(),
            catalogComplete: true,
        });

        assert.deepEqual(migrated.unparsedKeys, ['group-2']);
        assert.ok(migrated.state.has('group-1'));
    });

    it('normalizes feed dates and group ids, reporting unresolved entries', () => {
        const migrated = migrateNewReleasesMap(
            {
                old: {
                    id: 'release-1',
                    title: 'Album',
                    artists: { 'artist-1': 'Artist' },
                    date_for_display: '10.02.2026',
                    'primary-type': 'Album',
                },
                resolved: {
                    id: 'release-2',
                    title: 'Single',
                    artists: { 'artist-1': 'Artist' },
                    date: '2026-02-11',
                    date_for_display: '11.02.2026',
                    'primary-type': 'Single',
                    releaseGroupId: 'group-2',
                },
                invalid: { id: 'release-3' },
            },
            new Map([['release-1', 'group-1']]),
        );

        assert.deepEqual(migrated.invalidKeys, ['invalid']);
        assert.deepEqual(migrated.unresolvedGroupIds, []);
        assert.equal(migrated.map['release-1']?.date, '2026-02-10');
        assert.equal(migrated.map['release-1']?.releaseGroupId, 'group-1');
        assert.equal(migrated.map['release-2']?.date, '2026-02-11');
    });

    it('keeps an unresolved group id null and reports it', () => {
        const migrated = migrateNewReleasesMap(
            {
                'release-9': {
                    id: 'release-9',
                    title: 'Unknown',
                    artists: { 'artist-1': 'Artist' },
                    date: null,
                    date_for_display: 'Unknown date',
                    'primary-type': 'Single',
                },
            },
            new Map(),
        );

        assert.deepEqual(migrated.unresolvedGroupIds, ['release-9']);
        assert.equal(migrated.map['release-9']?.releaseGroupId, null);
        assert.equal(migrated.map['release-9']?.date, null);
    });
});
