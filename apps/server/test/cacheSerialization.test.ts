import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    serializeData,
    deserializeData,
    splitUtf8StringByByteSize,
    parseChunkMetadata,
    getEffectiveTtlInHours,
} from '../src/services/cache/cacheSerialization.js';

describe('serializeData / deserializeData', () => {
    it('round-trips a simple object', () => {
        const data = { name: 'test', count: 42 };
        assert.deepEqual(deserializeData(serializeData(data)), data);
    });

    it('round-trips undefined values', () => {
        const data = { a: 'hello', b: undefined, c: null };
        const serialized = serializeData(data);
        const deserialized = deserializeData<typeof data>(serialized);
        assert.equal(deserialized.a, 'hello');
        assert.equal(deserialized.b, undefined);
        assert.equal(deserialized.c, null);
    });

    it('round-trips nested objects', () => {
        const data = { outer: { inner: { deep: 'value' } } };
        assert.deepEqual(deserializeData(serializeData(data)), data);
    });

    it('round-trips arrays', () => {
        const data = [1, 'two', null, undefined, { key: 'value' }];
        const deserialized = deserializeData<Array<unknown>>(serializeData(data));
        assert.equal(deserialized[0], 1);
        assert.equal(deserialized[1], 'two');
        assert.equal(deserialized[2], null);
        assert.equal(deserialized[3], undefined);
        assert.deepEqual(deserialized[4], { key: 'value' });
    });
});

describe('splitUtf8StringByByteSize', () => {
    it('splits ASCII string correctly', () => {
        const result = splitUtf8StringByByteSize('abcdefghij', 5);
        assert.deepEqual(result, ['abcde', 'fghij']);
    });

    it('does not split multi-byte UTF-8 characters', () => {
        // '🎸' is 4 bytes in UTF-8
        const result = splitUtf8StringByByteSize('a🎸b🎸c', 5);
        // 'a' (1 byte) + '🎸' (4 bytes) = 5 bytes → first chunk
        // 'b' (1 byte) + '🎸' (4 bytes) = 5 bytes → second chunk
        // 'c' (1 byte) → third chunk
        assert.deepEqual(result, ['a🎸', 'b🎸', 'c']);
    });

    it('returns single chunk for string smaller than max', () => {
        const result = splitUtf8StringByByteSize('abc', 100);
        assert.deepEqual(result, ['abc']);
    });

    it('returns empty array for empty string', () => {
        const result = splitUtf8StringByByteSize('', 100);
        assert.deepEqual(result, []);
    });

    it('throws for character larger than max bytes', () => {
        assert.throws(() => splitUtf8StringByByteSize('🎸', 2), /A single character is larger/);
    });
});

describe('parseChunkMetadata', () => {
    it('parses valid metadata', () => {
        assert.equal(parseChunkMetadata('{"totalChunks":5}'), 5);
    });

    it('returns null for null input', () => {
        assert.equal(parseChunkMetadata(null), null);
    });

    it('returns null for invalid JSON', () => {
        assert.equal(parseChunkMetadata('not json'), null);
    });

    it('returns null for missing totalChunks', () => {
        assert.equal(parseChunkMetadata('{"other":1}'), null);
    });

    it('returns null for non-positive totalChunks', () => {
        assert.equal(parseChunkMetadata('{"totalChunks":0}'), null);
        assert.equal(parseChunkMetadata('{"totalChunks":-1}'), null);
    });
});

describe('getEffectiveTtlInHours', () => {
    it('returns valid ttl when provided', () => {
        assert.equal(getEffectiveTtlInHours(48), 48);
    });

    it('returns default for undefined', () => {
        assert.equal(getEffectiveTtlInHours(undefined, 336), 336);
    });

    it('returns default for zero', () => {
        assert.equal(getEffectiveTtlInHours(0, 336), 336);
    });

    it('returns default for negative', () => {
        assert.equal(getEffectiveTtlInHours(-5, 336), 336);
    });

    it('returns default for NaN', () => {
        assert.equal(getEffectiveTtlInHours(NaN, 336), 336);
    });
});
