import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { chunkArray, dedupeStrings } from '../src/common/utils/array.js';

describe('chunkArray', () => {
    it('splits an array into chunks of the given size', () => {
        assert.deepEqual(chunkArray([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
    });

    it('returns a single chunk when size >= array length', () => {
        assert.deepEqual(chunkArray([1, 2, 3], 5), [[1, 2, 3]]);
    });

    it('returns empty array for empty input', () => {
        assert.deepEqual(chunkArray([], 3), []);
    });

    it('throws RangeError when size is zero', () => {
        assert.throws(() => chunkArray([1, 2, 3], 0), RangeError);
        assert.throws(() => chunkArray([], 0), RangeError);
    });

    it('throws RangeError when size is negative', () => {
        assert.throws(() => chunkArray([1, 2], -1), RangeError);
    });

    it('chunks into size-1 arrays', () => {
        assert.deepEqual(chunkArray(['a', 'b', 'c'], 1), [['a'], ['b'], ['c']]);
    });
});

describe('dedupeStrings', () => {
    it('removes duplicate values', () => {
        assert.deepEqual(dedupeStrings(['a', 'b', 'a', 'c']), ['a', 'b', 'c']);
    });

    it('trims values before comparing', () => {
        assert.deepEqual(dedupeStrings(['  a  ', 'a', ' b ']), ['a', 'b']);
    });

    it('skips empty and whitespace-only strings', () => {
        assert.deepEqual(dedupeStrings(['a', '', '  ', 'b']), ['a', 'b']);
    });

    it('returns empty array for empty input', () => {
        assert.deepEqual(dedupeStrings([]), []);
    });

    it('preserves order of first occurrence', () => {
        assert.deepEqual(dedupeStrings(['c', 'a', 'b', 'a']), ['c', 'a', 'b']);
    });
});
