import { describe, expect, it } from 'vitest';
import { getUpdateDialogTitle } from './updateCopy';

describe('getUpdateDialogTitle', () => {
    it('returns "Update Available" for available', () => {
        expect(getUpdateDialogTitle('available')).toBe('Update Available');
    });

    it('returns "Pawify Is Up To Date" for current', () => {
        expect(getUpdateDialogTitle('current')).toBe('Pawify Is Up To Date');
    });

    it('returns "No Update Available" for not_found', () => {
        expect(getUpdateDialogTitle('not_found')).toBe('No Update Available');
    });

    it('returns "Checking for Updates" for checking', () => {
        expect(getUpdateDialogTitle('checking')).toBe('Checking for Updates');
    });

    it('returns "Update Check Failed" for error', () => {
        expect(getUpdateDialogTitle('error')).toBe('Update Check Failed');
    });

    it('returns "Update Check Failed" for unknown status', () => {
        expect(getUpdateDialogTitle('idle' as any)).toBe('Update Check Failed');
    });
});
