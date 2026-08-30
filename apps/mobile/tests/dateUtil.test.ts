import { describe, expect, it } from 'vitest';
import { dateToTimestamp, formatDate, isFutureDate, sortReleasesByDate } from '@pawify/shared';

const dateTimeMin = -8640000000000000;

describe('dateToTimestamp', () => {
    it('parses full ISO date', () => {
        const ts = dateToTimestamp('2024-06-15');
        expect(ts).toBeGreaterThan(0);
        expect(new Date(ts).getFullYear()).toBe(2024);
    });

    it('parses year-only string', () => {
        const ts = dateToTimestamp('2023');
        expect(ts).toBeGreaterThan(0);
        expect(new Date(ts).getFullYear()).toBe(2023);
    });

    it('parses year-month string', () => {
        const ts = dateToTimestamp('2023-05');
        expect(ts).toBeGreaterThan(0);
        expect(new Date(ts).getFullYear()).toBe(2023);
        expect(new Date(ts).getMonth()).toBe(4); // May = 4 (0-indexed)
    });

    it('returns dateTimeMin for null', () => {
        expect(dateToTimestamp(null)).toBe(dateTimeMin);
    });

    it('returns dateTimeMin for empty string', () => {
        expect(dateToTimestamp('')).toBe(dateTimeMin);
    });

    it('returns dateTimeMin for whitespace-only string', () => {
        expect(dateToTimestamp('   ')).toBe(dateTimeMin);
    });

    it('returns dateTimeMin for completely invalid date', () => {
        expect(dateToTimestamp('not-a-date')).toBe(dateTimeMin);
    });

    it('returns deterministic timestamp for same input', () => {
        expect(dateToTimestamp('2024-01-15')).toBe(dateToTimestamp('2024-01-15'));
    });
});

describe('formatDate', () => {
    it('formats full date as DD.MM.YYYY', () => {
        expect(formatDate('2024-06-05')).toBe('05.06.2024');
    });

    it('formats year-only as just the year', () => {
        expect(formatDate('2023')).toBe('2023');
    });

    it('formats year-month with no day', () => {
        expect(formatDate('2023-07')).toBe('07.2023');
    });

    it('returns "Unknown date" for null', () => {
        expect(formatDate(null)).toBe('Unknown date');
    });

    it('returns "Unknown date" for empty string', () => {
        expect(formatDate('')).toBe('Unknown date');
    });

    it('pads single-digit day and month', () => {
        expect(formatDate('2024-3-9')).toBe('09.03.2024');
    });
});

describe('isFutureDate', () => {
    it('returns false for a past date', () => {
        expect(isFutureDate('2020-01-01')).toBe(false);
    });

    it('returns true for a far-future date', () => {
        expect(isFutureDate('2099-12-31')).toBe(true);
    });

    it('returns false for null', () => {
        // null maps to dateTimeMin which is always in the past
        expect(isFutureDate(null)).toBe(false);
    });
});

describe('sortReleasesByDate', () => {
    it('sorts newest first (mutates input)', () => {
        const releases = [
            { id: '1', date: '2020-01-01' },
            { id: '2', date: '2024-06-15' },
            { id: '3', date: '2022-03-10' },
        ] as any[];

        sortReleasesByDate(releases);
        expect(releases[0].id).toBe('2');
        expect(releases[1].id).toBe('3');
        expect(releases[2].id).toBe('1');
    });

    it('puts null-dated releases last', () => {
        const releases = [
            { id: '1', date: null },
            { id: '2', date: '2024-01-01' },
        ] as any[];

        sortReleasesByDate(releases);
        expect(releases[0].id).toBe('2');
        expect(releases[1].id).toBe('1');
    });

    it('handles empty array', () => {
        const releases: any[] = [];
        sortReleasesByDate(releases);
        expect(releases).toEqual([]);
    });
});
