import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { sortNewReleasesNewestFirst } from '../src/features/releases/domain/newReleaseSorting.js';
import { createNewRelease } from './helpers/releaseFixtures.js';

describe('sortNewReleasesNewestFirst', () => {
    it('sorts full dates newest first', () => {
        const releases = [
            createNewRelease({ id: 'old', date: '2020-01-01', date_for_display: '01.01.2020' }),
            createNewRelease({ id: 'new', date: '2026-06-01', date_for_display: '01.06.2026' }),
            createNewRelease({ id: 'mid', date: '2023-03-15', date_for_display: '15.03.2023' }),
        ];

        const sorted = sortNewReleasesNewestFirst(releases);

        assert.deepEqual(
            sorted.map((r) => r.id),
            ['new', 'mid', 'old'],
        );
    });

    it('sorts year-only dates correctly', () => {
        const releases = [
            createNewRelease({ id: 'a', date: '2020', date_for_display: '2020' }),
            createNewRelease({ id: 'b', date: '2026', date_for_display: '2026' }),
        ];

        const sorted = sortNewReleasesNewestFirst(releases);
        assert.deepEqual(
            sorted.map((r) => r.id),
            ['b', 'a'],
        );
    });

    it('sorts null dates last', () => {
        const releases = [
            createNewRelease({ id: 'no-date', date: null, date_for_display: 'Unknown date' }),
            createNewRelease({ id: 'dated', date: '2026-01-01', date_for_display: '01.01.2026' }),
        ];

        const sorted = sortNewReleasesNewestFirst(releases);
        assert.equal(sorted[0]!.id, 'dated');
        assert.equal(sorted[1]!.id, 'no-date');
    });

    it('treats null dates equally (dateToTimestamp returns MIN_SAFE_INTEGER)', () => {
        // When date is null, dateToTimestamp returns Number.MIN_SAFE_INTEGER (truthy),
        // All null-date releases sort equally and maintain insertion order.
        const releases = [
            createNewRelease({ id: 'a', date: null, date_for_display: '15.06.2024' }),
            createNewRelease({ id: 'b', date: null, date_for_display: '01.01.2025' }),
        ];

        const sorted = sortNewReleasesNewestFirst(releases);
        // Both have the same sort time, insertion order preserved
        assert.equal(sorted[0]!.id, 'a');
        assert.equal(sorted[1]!.id, 'b');
    });

    it('sorts Unknown date last', () => {
        const releases = [
            createNewRelease({ id: 'unknown', date: null, date_for_display: 'Unknown date' }),
            createNewRelease({ id: 'dated', date: '2026-01-01', date_for_display: '01.01.2026' }),
        ];

        const sorted = sortNewReleasesNewestFirst(releases);
        assert.equal(sorted[0]!.id, 'dated');
        assert.equal(sorted[1]!.id, 'unknown');
    });

    it('does not mutate the original array', () => {
        const releases = [
            createNewRelease({ id: 'old', date: '2020-01-01' }),
            createNewRelease({ id: 'new', date: '2026-01-01' }),
        ];
        const originalOrder = releases.map((r) => r.id);

        sortNewReleasesNewestFirst(releases);

        assert.deepEqual(
            releases.map((r) => r.id),
            originalOrder,
        );
    });
});
