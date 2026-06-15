import { describe, expect, it } from 'vitest';
import { fillMissingIdsWithNull, mergeNullableStringMaps } from './nullableMaps';

describe('fillMissingIdsWithNull', () => {
    it('fills undefined IDs with null', () => {
        const result = fillMissingIdsWithNull(['a', 'b', 'c'], { a: 'url', b: undefined });
        expect(result).toEqual({ a: 'url', b: null, c: null });
    });

    it('preserves existing values including null', () => {
        const result = fillMissingIdsWithNull(['a', 'b'], { a: 'url', b: null });
        expect(result).toEqual({ a: 'url', b: null });
    });

    it('preserves existing string values', () => {
        const result = fillMissingIdsWithNull(['a'], { a: 'existing' });
        expect(result.a).toBe('existing');
    });

    it('returns shallow copy when all IDs present', () => {
        const input = { a: 'url' };
        const result = fillMissingIdsWithNull(['a'], input);
        expect(result).toEqual(input);
        expect(result).not.toBe(input);
    });

    it('handles empty IDs array', () => {
        const input = { a: 'url' };
        const result = fillMissingIdsWithNull([], input);
        expect(result).toEqual(input);
    });

    it('handles empty values object', () => {
        const result = fillMissingIdsWithNull(['a', 'b'], {});
        expect(result).toEqual({ a: null, b: null });
    });
});

describe('mergeNullableStringMaps', () => {
    it('skips undefined incoming values', () => {
        const current = { a: 'existing' };
        const result = mergeNullableStringMaps(current, { a: undefined });
        expect(result).toBe(current); // same reference
        expect(result.a).toBe('existing');
    });

    it('preserves existing value when incoming is null', () => {
        const current = { a: 'existing' };
        const result = mergeNullableStringMaps(current, { a: null });
        expect(result).toBe(current);
        expect(result.a).toBe('existing');
    });

    it('updates when incoming has a real value', () => {
        const current = { a: 'old' };
        const result = mergeNullableStringMaps(current, { a: 'new' });
        expect(result.a).toBe('new');
        expect(result).not.toBe(current);
    });

    it('returns same reference when nothing changes', () => {
        const current = { a: 'same', b: 'also' };
        const result = mergeNullableStringMaps(current, { a: 'same', b: 'also' });
        expect(result).toBe(current);
    });

    it('returns same reference with empty incoming', () => {
        const current = { a: 'val' };
        const result = mergeNullableStringMaps(current, {});
        expect(result).toBe(current);
    });

    it('adds new keys from incoming', () => {
        const current = { a: 'val' };
        const result = mergeNullableStringMaps(current, { b: 'new' });
        expect(result).toEqual({ a: 'val', b: 'new' });
    });

    it('allows null for new keys (no existing value to preserve)', () => {
        const current = {};
        const result = mergeNullableStringMaps(current, { a: null });
        expect(result.a).toBe(null);
    });

    it('handles mixed changes in one call', () => {
        const current = { a: 'keep', b: 'old', c: 'keep' };
        const result = mergeNullableStringMaps(current, {
            a: null,        // preserve existing
            b: 'updated',   // update
            c: undefined,   // skip
            d: 'new',       // add
        });
        expect(result).toEqual({ a: 'keep', b: 'updated', c: 'keep', d: 'new' });
    });
});
