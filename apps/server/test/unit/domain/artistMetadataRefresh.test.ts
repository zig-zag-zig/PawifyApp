import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    isArtistMetadataStale,
    getArtistMetadataCacheTtlHours,
} from '../../../src/features/artists/artistMetadataRefresh.js';

describe('artistMetadataRefresh', () => {
    describe('isArtistMetadataStale', () => {
        it('returns true for undefined refreshedAt', () => {
            assert.equal(isArtistMetadataStale(undefined), true);
        });

        it('returns true for stale data', () => {
            const staleTime = 1;
            assert.equal(isArtistMetadataStale(staleTime, Date.now()), true);
        });

        it('returns false for recently refreshed data', () => {
            const recentTime = Date.now() - 1000;
            assert.equal(isArtistMetadataStale(recentTime), false);
        });
    });

    describe('getArtistMetadataCacheTtlHours', () => {
        it('returns configured default when no argument', () => {
            const result = getArtistMetadataCacheTtlHours();
            assert.ok(result >= 1);
        });

        it('returns the input value when within range', () => {
            const result = getArtistMetadataCacheTtlHours(24);
            assert.equal(result, 24);
        });

        it('clamps to at least 1 hour', () => {
            assert.equal(getArtistMetadataCacheTtlHours(-5), 1);
            assert.equal(getArtistMetadataCacheTtlHours(0), 1);
        });
    });
});
