import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BadRequestError } from '../src/common/http/errors.js';
import {
    optionalIntegerInRange,
    optionalNonNegativeInteger,
    optionalString,
    requireBoolean,
    requireNullablePositiveInteger,
    requireString,
    requireStringArray,
} from '../src/common/http/validation.js';

const assertBadRequest = (action: () => unknown, message: string): void => {
    assert.throws(action, (error) => {
        assert.ok(error instanceof BadRequestError);
        assert.equal(error.statusCode, 400);
        assert.equal(error.message, message);
        return true;
    });
};

describe('request validation helpers', () => {
    it('trims required and optional string fields', () => {
        assert.equal(requireString({ artistId: '  artist-123  ' }, 'artistId'), 'artist-123');
        assert.equal(optionalString({ sourcePushToken: ' token ' }, 'sourcePushToken'), 'token');
        assert.equal(optionalString({ sourcePushToken: '   ' }, 'sourcePushToken'), undefined);
        assert.equal(optionalString({ sourcePushToken: null }, 'sourcePushToken'), undefined);
    });

    it('throws clear 400 errors for malformed object and string inputs', () => {
        assertBadRequest(() => requireString(null, 'artistId'), 'Request body must be an object');
        assertBadRequest(
            () => requireString({ artistId: '   ' }, 'artistId'),
            'The artistId property in the body is required',
        );
        assertBadRequest(
            () => optionalString({ sourcePushToken: 12 }, 'sourcePushToken'),
            'The sourcePushToken property in the body must be a string',
        );
    });

    it('validates booleans, string arrays, and integer ranges without coercing invalid values', () => {
        assert.equal(requireBoolean({ enabled: false }, 'enabled'), false);
        assert.deepEqual(requireStringArray({ artistIds: [' a ', 'b', 'a'] }, 'artistIds'), [
            'a',
            'b',
        ]);
        assert.equal(requireNullablePositiveInteger({ months: null }, 'months', 24), null);
        assert.equal(requireNullablePositiveInteger({ months: '12' }, 'months', 24), 12);
        assert.equal(optionalNonNegativeInteger({ page: '' }, 'page', 0), 0);
        assert.equal(optionalIntegerInRange({ limit: '25' }, 'limit', 10, 1, 50), 25);

        assertBadRequest(
            () => requireStringArray({ artistIds: ['ok', ' '] }, 'artistIds'),
            'Every item in artistIds must be a non-empty string',
        );
        assertBadRequest(
            () => requireNullablePositiveInteger({ months: 25 }, 'months', 24),
            'The months property in the body must be a positive integer or null',
        );
        assertBadRequest(
            () => optionalIntegerInRange({ limit: '51' }, 'limit', 10, 1, 50),
            'The limit property in the body must be an integer between 1 and 50',
        );
    });

    it('requireBoolean rejects string "true"', () => {
        assertBadRequest(
            () => requireBoolean({ enabled: 'true' }, 'enabled'),
            'The enabled property in the body must be a boolean',
        );
    });

    it('requireStringArray enforces an optional maxItems cap', () => {
        assert.deepEqual(requireStringArray({ artistIds: ['a', 'b', 'c'] }, 'artistIds', 3), [
            'a',
            'b',
            'c',
        ]);
        assert.deepEqual(requireStringArray({ artistIds: ['a', 'a', 'b'] }, 'artistIds', 2), [
            'a',
            'b',
        ]);
        assertBadRequest(
            () => requireStringArray({ artistIds: ['a', 'b', 'c', 'd'] }, 'artistIds', 3),
            'The artistIds property in the body must contain at most 3 items',
        );
    });

    it('requireStringArray is uncapped when maxItems is omitted', () => {
        const large = Array.from({ length: 1000 }, (_, index) => `id-${index}`);
        assert.equal(requireStringArray({ artistIds: large }, 'artistIds').length, 1000);
    });

    it('optionalNonNegativeInteger returns fallback for undefined', () => {
        assert.equal(optionalNonNegativeInteger({}, 'page', 0), 0);
    });

    it('optionalString returns undefined for missing key', () => {
        assert.equal(optionalString({}, 'missing'), undefined);
    });
});
