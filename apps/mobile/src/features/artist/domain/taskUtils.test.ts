import { describe, expect, it } from 'vitest';
import { isTaskSettled, getErrorMessage } from './taskUtils';

describe('isTaskSettled', () => {
    it('returns false for undefined', () => {
        expect(isTaskSettled(undefined)).toBe(false);
    });

    it('returns true when result is set', () => {
        expect(isTaskSettled({ result: 'data' } as any)).toBe(true);
    });

    it('returns true when error is set', () => {
        expect(isTaskSettled({ error: new Error('fail') } as any)).toBe(true);
    });

    it('returns false when neither result nor error is set', () => {
        expect(isTaskSettled({} as any)).toBe(false);
    });
});

describe('getErrorMessage', () => {
    it('delegates to getUserFacingErrorMessage for friendly Error', () => {
        const result = getErrorMessage(new Error('Invalid email or password.'), 'fallback');
        expect(result).toBe('Invalid email or password.');
    });

    it('returns fallback for non-friendly Error', () => {
        const result = getErrorMessage(new Error('internal stack trace'), 'fallback');
        expect(result).toBe('fallback');
    });

    it('uses custom fallback for non-Error', () => {
        const result = getErrorMessage(null, 'custom fallback');
        expect(result).toBe('custom fallback');
    });
});
