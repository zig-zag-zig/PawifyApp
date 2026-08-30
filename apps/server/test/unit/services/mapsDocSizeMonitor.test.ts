import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkMapsDocSizeThresholds } from '../../../src/services/monitoring/mapsDocSizeThresholds.js';

/**
 * Tests the ACTUAL production threshold logic exported from mapsDocSizeMonitor.
 * Regression coverage: if the thresholds change (or the comparison logic), these break.
 */
describe('mapsDocSizeMonitor thresholds (production code)', () => {
    it('returns ok for small sizes', () => {
        assert.equal(checkMapsDocSizeThresholds(0), 'ok');
        assert.equal(checkMapsDocSizeThresholds(100), 'ok');
        assert.equal(checkMapsDocSizeThresholds(1024), 'ok');
        assert.equal(checkMapsDocSizeThresholds(850 * 1024), 'ok'); // exactly at warn threshold (strict >)
    });

    it('returns warn above 850 KiB', () => {
        assert.equal(checkMapsDocSizeThresholds(850 * 1024 + 1), 'warn');
        assert.equal(checkMapsDocSizeThresholds(900 * 1024), 'warn');
        assert.equal(checkMapsDocSizeThresholds(949 * 1024), 'warn');
    });

    it('returns critical above 950 KiB', () => {
        assert.equal(checkMapsDocSizeThresholds(950 * 1024 + 1), 'critical');
        assert.equal(checkMapsDocSizeThresholds(1000 * 1024), 'critical');
        assert.equal(checkMapsDocSizeThresholds(1024 * 1024), 'critical'); // 1 MiB (Firestore limit)
    });

    it('950 KiB boundary returns warn (critical is strict greater-than)', () => {
        assert.equal(checkMapsDocSizeThresholds(950 * 1024), 'warn');
    });
});
