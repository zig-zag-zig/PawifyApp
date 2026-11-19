import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { toStoredNewRelease } from '../../../src/features/releases/domain/newReleaseEntry.js';
import type {
    ReleaseEditionCandidate,
    ReleaseGroupCandidate,
    ReleaseGroupEvent,
} from '../../../src/features/releases/domain/releaseGroupProcessing.js';

const edition = (overrides: Partial<ReleaseEditionCandidate> = {}): ReleaseEditionCandidate => ({
    releaseId: 'release-2',
    date: '2003-04-29',
    status: 'Official',
    trackCount: 15,
    formats: ['CD'],
    title: 'Hunger for More',
    disambiguation: null,
    editionKeywords: [],
    ...overrides,
});

const candidate = (overrides: Partial<ReleaseGroupCandidate> = {}): ReleaseGroupCandidate => ({
    id: 'group-1',
    title: 'Hunger for More',
    date: '2003-04-29',
    disambiguation: '',
    primaryType: 'Album',
    releaseIds: ['release-1', 'release-2'],
    newestReleaseId: 'release-2',
    newestReleaseDate: '2003-04-29',
    officialEditions: [edition()],
    ...overrides,
});

const event = (overrides: Partial<ReleaseGroupEvent> = {}): ReleaseGroupEvent => ({
    group: candidate(),
    reason: 'new-group',
    edition: edition(),
    date: '2003-04-29',
    trackCount: 15,
    editionKeywords: [],
    ...overrides,
});

describe('toStoredNewRelease', () => {
    it('pairs the group with the event edition', () => {
        const entry = toStoredNewRelease(event(), [
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
        assert.equal(entry.notificationReason, 'new-group');
        assert.equal(entry.trackCount, 15);
        assert.deepEqual(entry.editionKeywords, []);
    });

    it('uses the edition that caused a content event, not the newest pressing', () => {
        const entry = toStoredNewRelease(
            event({
                reason: 'new-edition',
                edition: edition({
                    releaseId: 'deluxe-release',
                    date: '2026-03-14',
                    title: 'Hunger for More (Deluxe)',
                    editionKeywords: ['deluxe'],
                    trackCount: 18,
                }),
                date: '2026-03-14',
                trackCount: 18,
                editionKeywords: ['deluxe'],
            }),
            [],
        );

        assert.equal(entry.id, 'deluxe-release');
        assert.equal(entry.date, '2026-03-14');
        assert.equal(entry.trackCount, 18);
        assert.deepEqual(entry.editionKeywords, ['deluxe']);
        assert.equal(entry.notificationReason, 'new-edition');
    });

    it('counts a single-release group as one, so the tap opens the release', () => {
        const entry = toStoredNewRelease(
            event({
                group: candidate({
                    releaseIds: ['only-release'],
                    newestReleaseId: 'only-release',
                }),
                edition: edition({ releaseId: 'only-release' }),
            }),
            [],
        );

        assert.equal(entry.releaseCount, 1);
        assert.equal(entry.id, 'only-release');
    });

    it('keeps an empty artist map rather than inventing a name', () => {
        const entry = toStoredNewRelease(event(), []);

        assert.deepEqual(entry.artists, {});
    });

    it('formats a missing date without throwing', () => {
        const entry = toStoredNewRelease(
            event({ date: null, edition: edition({ date: null }) }),
            [],
        );

        assert.equal(entry.date, null);
        assert.equal(typeof entry.date_for_display, 'string');
    });
});