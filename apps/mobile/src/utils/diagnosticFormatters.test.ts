import { describe, expect, it } from 'vitest';
import {
    elapsedSince,
    shortenString,
    describeError,
    describeIds,
    describeValueShape,
} from './diagnosticFormatters';

describe('elapsedSince', () => {
    it('returns null for null', () => {
        expect(elapsedSince(null)).toBeNull();
    });

    it('returns null for undefined', () => {
        expect(elapsedSince(undefined)).toBeNull();
    });

    it('returns non-negative number for valid timestamp', () => {
        const result = elapsedSince(Date.now() - 100);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThan(200);
    });
});

describe('shortenString', () => {
    it('returns string within limit unchanged', () => {
        expect(shortenString('hello', 10)).toBe('hello');
    });

    it('returns string at limit unchanged', () => {
        expect(shortenString('hello', 5)).toBe('hello');
    });

    it('truncates and appends ... when over limit', () => {
        expect(shortenString('hello world', 5)).toBe('hello...');
    });

    it('uses default max length of 240', () => {
        const long = 'a'.repeat(241);
        expect(shortenString(long)).toBe('a'.repeat(240) + '...');
    });

    it('returns short strings unchanged with default limit', () => {
        expect(shortenString('short')).toBe('short');
    });
});

describe('describeError', () => {
    it('returns name and message for Error', () => {
        const result = describeError(new Error('test error'));
        expect(result).toMatchObject({ name: 'Error', message: 'test error' });
    });

    it('includes statusCode for ApiCallError-like errors', () => {
        const error = Object.assign(new Error('api error'), { statusCode: 404 });
        const result = describeError(error);
        expect(result).toMatchObject({ statusCode: 404 });
    });

    it('includes userMessage for ApiCallError-like errors', () => {
        const error = Object.assign(new Error('api error'), { userMessage: 'Not found' });
        const result = describeError(error);
        expect(result).toMatchObject({ userMessage: 'Not found' });
    });

    it('handles non-Error values', () => {
        const result = describeError('string error');
        expect(result).toHaveProperty('value');
    });

    it('handles null', () => {
        const result = describeError(null);
        expect(result).toHaveProperty('value');
    });
});

describe('describeIds', () => {
    it('deduplicates ids', () => {
        const result = describeIds(['a', 'a', 'b', 'b', 'c']);
        expect(result.count).toBe(3);
    });

    it('filters empty strings', () => {
        const result = describeIds(['a', '', 'b', '']);
        expect(result.count).toBe(2);
    });

    it('respects maxItems', () => {
        const result = describeIds(['a', 'b', 'c', 'd'], 2);
        expect(result.sample).toEqual(['a', 'b']);
        expect(result.remaining).toBe(2);
    });

    it('returns zero remaining when under limit', () => {
        const result = describeIds(['a', 'b']);
        expect(result.remaining).toBe(0);
    });
});

describe('describeValueShape', () => {
    it('describes array', () => {
        const result = describeValueShape([1, 2, 3]);
        expect(result).toMatchObject({ kind: 'array', length: 3 });
    });

    it('describes string', () => {
        const result = describeValueShape('hello');
        expect(result).toMatchObject({ kind: 'string', length: 5 });
    });

    it('describes object', () => {
        const result = describeValueShape({ status: 'ok', type: 'test' });
        expect(result).toMatchObject({ kind: 'object', keyCount: 2 });
    });

    it('describes null', () => {
        const result = describeValueShape(null);
        expect(result).toMatchObject({ kind: 'null' });
    });

    it('describes number', () => {
        const result = describeValueShape(42);
        expect(result).toMatchObject({ kind: 'number', value: 42 });
    });

    it('extracts status and type from objects', () => {
        const result = describeValueShape({ status: 'completed', type: 'task', taskId: 't1' }) as Record<string, unknown>;
        expect(result.status).toBe('completed');
        expect(result.type).toBe('task');
        expect(result.taskId).toBe('t1');
    });
});
