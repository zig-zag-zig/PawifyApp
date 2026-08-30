import { describe, expect, it } from 'vitest';
import { DEFAULT_FOREGROUND_REFRESH_MIN_INACTIVE_MS, shouldRunForegroundRefresh } from './foregroundRefreshPolicy';

describe('shouldRunForegroundRefresh', () => {
    it('returns true when inactiveMs is null', () => {
        expect(shouldRunForegroundRefresh(null)).toBe(true);
    });

    it('returns false when inactiveMs is below the threshold', () => {
        expect(shouldRunForegroundRefresh(60_000)).toBe(false);
    });

    it('returns true when inactiveMs equals the threshold', () => {
        expect(shouldRunForegroundRefresh(DEFAULT_FOREGROUND_REFRESH_MIN_INACTIVE_MS)).toBe(true);
    });

    it('returns true when inactiveMs exceeds the threshold', () => {
        expect(shouldRunForegroundRefresh(10 * 60 * 1000)).toBe(true);
    });

    it('respects a custom minInactiveMs', () => {
        expect(shouldRunForegroundRefresh(2000, 5000)).toBe(false);
        expect(shouldRunForegroundRefresh(5000, 5000)).toBe(true);
        expect(shouldRunForegroundRefresh(10_000, 5000)).toBe(true);
    });
});
