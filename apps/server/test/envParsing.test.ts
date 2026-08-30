import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parsePositiveIntEnv, parseBooleanEnv, parseFloatEnv } from '../src/config/envParsing.js';

describe('parsePositiveIntEnv', () => {
    it('parses a valid positive integer', () => {
        assert.equal(parsePositiveIntEnv('42', 10), 42);
    });

    it('returns fallback for undefined', () => {
        assert.equal(parsePositiveIntEnv(undefined, 10), 10);
    });

    it('returns fallback for zero (not positive)', () => {
        assert.equal(parsePositiveIntEnv('0', 10), 10);
    });

    it('returns fallback for negative number', () => {
        assert.equal(parsePositiveIntEnv('-5', 10), 10);
    });

    it('returns fallback for non-numeric string', () => {
        assert.equal(parsePositiveIntEnv('abc', 10), 10);
    });

    it('returns fallback for empty string', () => {
        assert.equal(parsePositiveIntEnv('', 10), 10);
    });

    it('parses integer from string with trailing content', () => {
        assert.equal(parsePositiveIntEnv('42abc', 10), 42);
    });
});

describe('parseBooleanEnv', () => {
    it('parses true values', () => {
        assert.equal(parseBooleanEnv('true'), true);
        assert.equal(parseBooleanEnv('1'), true);
        assert.equal(parseBooleanEnv('yes'), true);
        assert.equal(parseBooleanEnv('TRUE'), true);
        assert.equal(parseBooleanEnv('Yes'), true);
    });

    it('parses false values', () => {
        assert.equal(parseBooleanEnv('false'), false);
        assert.equal(parseBooleanEnv('0'), false);
        assert.equal(parseBooleanEnv('no'), false);
        assert.equal(parseBooleanEnv('FALSE'), false);
    });

    it('returns fallback for undefined', () => {
        assert.equal(parseBooleanEnv(undefined), false);
        assert.equal(parseBooleanEnv(undefined, true), true);
    });

    it('returns fallback for unknown strings', () => {
        assert.equal(parseBooleanEnv('maybe', true), true);
        assert.equal(parseBooleanEnv('maybe', false), false);
    });

    it('trims whitespace', () => {
        assert.equal(parseBooleanEnv('  true  '), true);
        assert.equal(parseBooleanEnv('  false  '), false);
    });
});

describe('parseFloatEnv', () => {
    it('parses a valid float within range', () => {
        assert.equal(parseFloatEnv('0.5', 0), 0.5);
    });

    it('returns fallback for undefined', () => {
        assert.equal(parseFloatEnv(undefined, 0.3), 0.3);
    });

    it('returns fallback for non-numeric string', () => {
        assert.equal(parseFloatEnv('abc', 0.3), 0.3);
    });

    it('returns fallback when value is below min', () => {
        assert.equal(parseFloatEnv('-0.1', 0.3, 0, 1), 0.3);
    });

    it('returns fallback when value is above max', () => {
        assert.equal(parseFloatEnv('1.5', 0.3, 0, 1), 0.3);
    });

    it('accepts value at min boundary', () => {
        assert.equal(parseFloatEnv('0', 0.3, 0, 1), 0);
    });

    it('accepts value at max boundary', () => {
        assert.equal(parseFloatEnv('1', 0.3, 0, 1), 1);
    });

    it('uses custom min and max', () => {
        assert.equal(parseFloatEnv('5', 0, 1, 10), 5);
        assert.equal(parseFloatEnv('0.5', 0, 1, 10), 0);
    });
});
