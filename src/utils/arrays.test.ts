import { describe, expect, it } from 'vitest';
import { mergeUniqueIds, removeIds } from './arrays';

describe('mergeUniqueIds', () => {
    it('returns existingIds when incomingIds is empty', () => {
        const existing = ['a', 'b'];
        expect(mergeUniqueIds(existing, [])).toBe(existing);
    });

    it('adds new ids to existing', () => {
        const result = mergeUniqueIds(['a'], ['b', 'c']);
        expect(result).toEqual(['a', 'b', 'c']);
    });

    it('deduplicates overlapping ids', () => {
        const result = mergeUniqueIds(['a', 'b'], ['b', 'c']);
        expect(result).toEqual(['a', 'b', 'c']);
    });

    it('handles empty existing array', () => {
        const result = mergeUniqueIds([], ['a', 'b']);
        expect(result).toEqual(['a', 'b']);
    });

    it('deduplicates within incomingIds', () => {
        const result = mergeUniqueIds(['a'], ['b', 'b', 'c']);
        expect(result).toEqual(['a', 'b', 'c']);
    });
});

describe('removeIds', () => {
    it('returns existingIds when idsToRemove is empty', () => {
        const existing = ['a', 'b'];
        expect(removeIds(existing, [])).toBe(existing);
    });

    it('returns existingIds when existingIds is empty', () => {
        expect(removeIds([], ['a'])).toEqual([]);
    });

    it('removes matching ids', () => {
        const result = removeIds(['a', 'b', 'c'], ['b']);
        expect(result).toEqual(['a', 'c']);
    });

    it('removes multiple ids', () => {
        const result = removeIds(['a', 'b', 'c', 'd'], ['b', 'd']);
        expect(result).toEqual(['a', 'c']);
    });

    it('ignores ids not present in existing', () => {
        const result = removeIds(['a', 'b'], ['x', 'y']);
        expect(result).toEqual(['a', 'b']);
    });

    it('returns empty when all ids removed', () => {
        const result = removeIds(['a', 'b'], ['a', 'b']);
        expect(result).toEqual([]);
    });
});
