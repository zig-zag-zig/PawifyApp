import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    shouldRefetchRemoteState,
    mapCoverState,
    mapLyricsState,
} from '../src/utils/helpers/remoteStateHelpers.js';

describe('shouldRefetchRemoteState', () => {
    it('returns true for undefined state', () => {
        assert.equal(shouldRefetchRemoteState(undefined), true);
    });

    it('returns false for state with url and no nextRefetchAt', () => {
        assert.equal(shouldRefetchRemoteState({ url: 'https://example.com/img.jpg' }), false);
    });

    it('returns false when nextRefetchAt is in the future', () => {
        const now = 1000;
        assert.equal(shouldRefetchRemoteState({ url: undefined, nextRefetchAt: 2000 }, now), false);
    });

    it('returns true when nextRefetchAt is in the past', () => {
        const now = 2000;
        assert.equal(shouldRefetchRemoteState({ url: undefined, nextRefetchAt: 1000 }, now), true);
    });

    it('returns true when both url and nextRefetchAt are undefined', () => {
        assert.equal(shouldRefetchRemoteState({ url: undefined, nextRefetchAt: undefined }), true);
    });

    it('returns true when nextRefetchAt equals now', () => {
        const now = 1000;
        assert.equal(shouldRefetchRemoteState({ url: undefined, nextRefetchAt: 1000 }, now), true);
    });
});

describe('mapCoverState', () => {
    it('returns transient state for undefined url', () => {
        const result = mapCoverState(undefined);
        assert.equal(result.url, undefined);
        assert.ok(typeof result.nextRefetchAt === 'number');
        assert.ok(result.nextRefetchAt! > Date.now());
    });

    it('returns persistent state for a valid URL string', () => {
        const result = mapCoverState('https://example.com/cover.jpg');
        assert.equal(result.url, 'https://example.com/cover.jpg');
        assert.equal(result.nextRefetchAt, undefined);
    });

    it('returns confirmed miss for null url', () => {
        const result = mapCoverState(null);
        assert.equal(result.url, null);
        assert.equal(result.confirmedMiss, true);
    });
});

describe('mapLyricsState', () => {
    it('returns transient state for undefined url', () => {
        const result = mapLyricsState(undefined);
        assert.equal(result.url, undefined);
        assert.ok(typeof result.nextRefetchAt === 'number');
    });

    it('returns persistent state for a valid URL', () => {
        const result = mapLyricsState('https://example.com/lyrics');
        assert.equal(result.url, 'https://example.com/lyrics');
        assert.equal(result.nextRefetchAt, undefined);
    });

    it('returns confirmed miss for null url', () => {
        const result = mapLyricsState(null);
        assert.equal(result.url, null);
        assert.equal(result.confirmedMiss, true);
    });

    it('returns confirmed miss for empty string', () => {
        const result = mapLyricsState('');
        assert.equal(result.url, '');
        assert.equal(result.confirmedMiss, true);
    });
});
