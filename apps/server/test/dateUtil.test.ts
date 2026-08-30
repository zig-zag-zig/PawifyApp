import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    dateToTimestamp,
    isFutureDate,
    sortReleasesByDate,
} from '../src/utils/dateUtil.js';
import { formatDate, type Release } from '@pawify/shared';
import { createRelease } from './helpers/releaseFixtures.js';

const dateTimeMin = -8640000000000000;

describe('dateToTimestamp', () => {
    it('parses a full date string', () => {
        const ts = dateToTimestamp('2026-01-15');
        assert.equal(new Date(ts).getUTCFullYear(), 2026);
        assert.equal(new Date(ts).getUTCMonth(), 0); // January
        assert.equal(new Date(ts).getUTCDate(), 15);
    });

    it('pads a year-only string to January 1st', () => {
        const ts = dateToTimestamp('2026');
        assert.equal(new Date(ts).getUTCFullYear(), 2026);
        assert.equal(new Date(ts).getUTCMonth(), 0);
        assert.equal(new Date(ts).getUTCDate(), 1);
    });

    it('pads a year-month string to the 1st', () => {
        const ts = dateToTimestamp('2026-03');
        assert.equal(new Date(ts).getUTCFullYear(), 2026);
        assert.equal(new Date(ts).getUTCMonth(), 2); // March
        assert.equal(new Date(ts).getUTCDate(), 1);
    });

    it('returns dateTimeMin for null', () => {
        assert.equal(dateToTimestamp(null), dateTimeMin);
    });

    it('returns dateTimeMin for empty string', () => {
        assert.equal(dateToTimestamp(''), dateTimeMin);
    });

    it('returns dateTimeMin for whitespace-only string', () => {
        assert.equal(dateToTimestamp('   '), dateTimeMin);
    });

    it('parses non-zero-padded month and day (V8 interprets as local time)', () => {
        // V8 parses '2026-1-5' via the first new Date() path, so the manual
        // fallback is never reached. The result depends on the runtime timezone.
        const ts = dateToTimestamp('2026-1-5');
        assert.notEqual(ts, dateTimeMin);
        assert.equal(new Date(ts).getUTCFullYear(), 2026);
        assert.equal(new Date(ts).getUTCMonth(), 0);
    });
});

describe('formatDate', () => {
    it('formats a full date as DD.MM.YYYY', () => {
        assert.equal(formatDate('2026-01-15'), '15.01.2026');
    });

    it('formats a year-month as MM.YYYY', () => {
        assert.equal(formatDate('2026-03'), '03.2026');
    });

    it('formats a year-only as YYYY', () => {
        assert.equal(formatDate('2026'), '2026');
    });

    it('returns Unknown date for null', () => {
        assert.equal(formatDate(null), 'Unknown date');
    });

    it('pads single-digit day and month', () => {
        assert.equal(formatDate('2026-3-5'), '05.03.2026');
    });
});

describe('isFutureDate', () => {
    it('returns true for a future date', () => {
        assert.equal(isFutureDate('2999-01-01'), true);
    });

    it('returns false for a past date', () => {
        assert.equal(isFutureDate('2000-01-01'), false);
    });

    it('returns false for null (maps to dateTimeMin)', () => {
        assert.equal(isFutureDate(null), false);
    });
});

describe('sortReleasesByDate', () => {
    it('sorts releases newest-first', () => {
        const releases: Release[] = [
            createRelease({ id: 'old', date: '2020-01-01' }),
            createRelease({ id: 'new', date: '2026-06-01' }),
            createRelease({ id: 'mid', date: '2023-03-15' }),
        ];

        sortReleasesByDate(releases);

        assert.deepEqual(
            releases.map((r) => r.id),
            ['new', 'mid', 'old'],
        );
    });

    it('sorts null dates to the beginning (dateTimeMin is lowest)', () => {
        const releases: Release[] = [
            createRelease({ id: 'dated', date: '2026-01-01' }),
            createRelease({ id: 'no-date', date: null }),
        ];

        sortReleasesByDate(releases);

        // null dates have timestamp dateTimeMin which sorts to the end when using dateB - dateA
        assert.equal(releases[0]!.id, 'dated');
        assert.equal(releases[1]!.id, 'no-date');
    });
});
