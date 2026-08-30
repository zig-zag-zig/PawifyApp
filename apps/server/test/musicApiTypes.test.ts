import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    isFetchFailureResult,
    isConfirmedMissingFetchFailure,
} from '../src/services/musicApi/types.js';

describe('isFetchFailureResult', () => {
    it('returns true for valid failure with numeric status', () => {
        assert.equal(isFetchFailureResult({ __fetchFailure: true, status: 500 }), true);
    });

    it('returns true for valid failure with null status', () => {
        assert.equal(isFetchFailureResult({ __fetchFailure: true, status: null }), true);
    });

    it('returns false for null', () => {
        assert.equal(isFetchFailureResult(null), false);
    });

    it('returns false for undefined', () => {
        assert.equal(isFetchFailureResult(undefined), false);
    });

    it('returns false for plain object without __fetchFailure', () => {
        assert.equal(isFetchFailureResult({ status: 500 }), false);
    });

    it('returns false for object with __fetchFailure false', () => {
        assert.equal(isFetchFailureResult({ __fetchFailure: false, status: 500 }), false);
    });

    it('returns false for object with invalid status type', () => {
        assert.equal(isFetchFailureResult({ __fetchFailure: true, status: 'error' }), false);
    });

    it('returns false for string', () => {
        assert.equal(isFetchFailureResult('error'), false);
    });
});

describe('isConfirmedMissingFetchFailure', () => {
    it('returns true for 404', () => {
        assert.equal(isConfirmedMissingFetchFailure({ __fetchFailure: true, status: 404 }), true);
    });

    it('returns true for 410', () => {
        assert.equal(isConfirmedMissingFetchFailure({ __fetchFailure: true, status: 410 }), true);
    });

    it('returns false for 500', () => {
        assert.equal(isConfirmedMissingFetchFailure({ __fetchFailure: true, status: 500 }), false);
    });

    it('returns false for null status', () => {
        assert.equal(isConfirmedMissingFetchFailure({ __fetchFailure: true, status: null }), false);
    });

    it('returns false for non-failure object', () => {
        assert.equal(isConfirmedMissingFetchFailure({ __fetchFailure: false, status: 404 }), false);
    });

    it('returns false for null', () => {
        assert.equal(isConfirmedMissingFetchFailure(null), false);
    });
});
