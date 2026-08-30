import { describe, expect, it } from 'vitest';
import { formatPublishedDate, formatBytes, getProgressLabel } from './updateModalFormatting';

describe('formatPublishedDate', () => {
    it('formats an ISO date string', () => {
        const result = formatPublishedDate('2024-06-15T00:00:00Z');
        expect(result).not.toBeNull();
        expect(result).toContain('2024');
        expect(result).toContain('Jun');
    });

    it('returns null for null', () => {
        expect(formatPublishedDate(null)).toBeNull();
    });

    it('returns null for invalid date string', () => {
        expect(formatPublishedDate('not-a-date')).toBeNull();
    });

    it('returns null for empty string', () => {
        expect(formatPublishedDate('')).toBeNull();
    });
});

describe('formatBytes', () => {
    it('formats KB values', () => {
        expect(formatBytes(1024)).toBe('1 KB');
        expect(formatBytes(2048)).toBe('2 KB');
    });

    it('formats MB values', () => {
        expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
        expect(formatBytes(10 * 1024 * 1024)).toBe('10 MB');
    });

    it('returns null for null', () => {
        expect(formatBytes(null)).toBeNull();
    });

    it('returns null for zero', () => {
        expect(formatBytes(0)).toBeNull();
    });

    it('returns null for negative', () => {
        expect(formatBytes(-100)).toBeNull();
    });
});

describe('getProgressLabel', () => {
    it('returns checking-permission label', () => {
        expect(getProgressLabel({ stage: 'checking-permission', progress: null, bytesWritten: null, contentLength: null })).toBe('Preparing installer');
    });

    it('returns downloading label', () => {
        expect(getProgressLabel({ stage: 'downloading', progress: 50, bytesWritten: 5000, contentLength: 10000 })).toBe('Downloading update');
    });

    it('returns opening-installer label', () => {
        expect(getProgressLabel({ stage: 'opening-installer', progress: 100, bytesWritten: 10000, contentLength: 10000 })).toBe('Opening installer');
    });

    it('returns preparing label for null progress', () => {
        expect(getProgressLabel(null)).toBe('Preparing update');
    });
});
