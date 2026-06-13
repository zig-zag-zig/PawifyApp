import { describe, expect, it } from 'vitest';
import { calculateArtistAge } from './calculateArtistAge';

describe('calculateArtistAge', () => {
    it('calculates age with full dates', () => {
        // Artist formed on 2000-06-15, today is effectively "now" in the test
        const age = calculateArtistAge('2000-01-01');
        // Should be at least 25 (2025-2000)
        expect(age).toBeGreaterThanOrEqual(25);
    });

    it('subtracts 1 when birthday has not occurred yet this year', () => {
        // If today is June 2025, an artist born on Dec 15 should be 1 year younger
        const now = new Date();
        const futureMonth = String(now.getMonth() + 2).padStart(2, '0');
        const startDate = `2000-${futureMonth}-15`;
        const age = calculateArtistAge(startDate);
        const expectedAge = now.getFullYear() - 2000 - 1;
        expect(age).toBe(expectedAge);
    });

    it('calculates age with end date (historical artist)', () => {
        const age = calculateArtistAge('1970-01-01', '2020-01-01');
        expect(age).toBe(50);
    });

    it('returns correct age when end date is before birthday in that year', () => {
        // Born June 15 1970, ended March 1 2020 -> should be 49 not 50
        const age = calculateArtistAge('1970-06-15', '2020-03-01');
        expect(age).toBe(49);
    });

    it('returns correct age when end date is after birthday in that year', () => {
        // Born June 15 1970, ended Aug 1 2020 -> should be 50
        const age = calculateArtistAge('1970-06-15', '2020-08-01');
        expect(age).toBe(50);
    });
});
