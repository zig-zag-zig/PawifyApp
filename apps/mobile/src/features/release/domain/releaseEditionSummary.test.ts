import { describe, expect, it } from 'vitest';
import {
    formatReleaseEditionAccessibilityLabel,
    formatReleaseEditionSummary,
} from './releaseEditionSummary';

describe('formatReleaseEditionSummary', () => {
    it('formats one format with a known track count and date', () => {
        expect(
            formatReleaseEditionSummary({
                formats: ['CD'],
                trackCount: 18,
                date: '2025-03-14',
            }),
        ).toBe('CD · 18 tracks · 14-Mar-2025');
    });

    it('joins multiple distinct formats', () => {
        expect(
            formatReleaseEditionSummary({
                formats: ['CD', 'DVD', 'CD'],
                trackCount: 24,
                date: '2025-03-14',
            }),
        ).toBe('CD + DVD · 24 tracks · 14-Mar-2025');
    });

    it('omits an unknown track count', () => {
        expect(
            formatReleaseEditionSummary({
                formats: ['CD'],
                trackCount: null,
                date: '2025-03-14',
            }),
        ).toBe('CD · 14-Mar-2025');
    });

    it('omits a zero track count instead of showing a misleading value', () => {
        expect(
            formatReleaseEditionSummary({
                formats: ['CD'],
                trackCount: 0,
                date: '2025-03-14',
            }),
        ).toBe('CD · 14-Mar-2025');
    });

    it('omits a missing date', () => {
        expect(
            formatReleaseEditionSummary({
                formats: ['CD'],
                trackCount: 18,
                date: null,
            }),
        ).toBe('CD · 18 tracks');
    });

    it('appends a non-Official status', () => {
        expect(
            formatReleaseEditionSummary({
                formats: ['CD'],
                trackCount: 15,
                date: '2025-03-14',
                status: 'Bootleg',
            }),
        ).toBe('CD · 15 tracks · 14-Mar-2025 · Bootleg');
    });

    it('never shows Official as a status chip', () => {
        expect(
            formatReleaseEditionSummary({
                formats: ['CD'],
                trackCount: 18,
                date: '2025-03-14',
                status: 'Official',
            }),
        ).toBe('CD · 18 tracks · 14-Mar-2025');
    });

    it('uses the singular track label for one track', () => {
        expect(
            formatReleaseEditionSummary({
                formats: ['Digital Media'],
                trackCount: 1,
                date: '2025-03-14',
            }),
        ).toBe('Digital Media · 1 track · 14-Mar-2025');
    });

    it('returns an empty string when nothing is known', () => {
        expect(formatReleaseEditionSummary({})).toBe('');
    });
});

describe('formatReleaseEditionAccessibilityLabel', () => {
    it('includes the title and the meaningful metadata', () => {
        expect(
            formatReleaseEditionAccessibilityLabel(
                'Album Deluxe',
                'CD · 18 tracks · 14-Mar-2025',
            ),
        ).toBe('Open release Album Deluxe, CD · 18 tracks · 14-Mar-2025');
    });

    it('falls back to the title alone when no metadata is known', () => {
        expect(formatReleaseEditionAccessibilityLabel('Album', '')).toBe(
            'Open release Album',
        );
    });
});