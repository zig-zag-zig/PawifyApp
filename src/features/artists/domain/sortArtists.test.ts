import { describe, expect, it } from 'vitest';

import { sortArtistsByDisplayName } from './sortArtists';

function artist(id: string, name: string) {
    return { id, name };
}

describe('sortArtistsByDisplayName', () => {
    it('sorts by trimmed display name without mutating the original list', () => {
        const artists = [
            artist('b', '  Beta'),
            artist('a', 'alpha'),
            artist('g', 'Gamma'),
        ];

        const sorted = sortArtistsByDisplayName(artists);

        expect(sorted.map(a => a.id)).toEqual(['a', 'b', 'g']);
        expect(artists.map(a => a.id)).toEqual(['b', 'a', 'g']);
    });

    it('returns empty array for empty input', () => {
        expect(sortArtistsByDisplayName([])).toEqual([]);
    });

    it('returns single artist unchanged', () => {
        const artists = [artist('x', 'Zelda')];
        const sorted = sortArtistsByDisplayName(artists);
        expect(sorted).toHaveLength(1);
        expect(sorted[0].id).toBe('x');
    });

    it('preserves already-sorted order', () => {
        const artists = [
            artist('a', 'Alpha'),
            artist('b', 'Beta'),
            artist('c', 'Gamma'),
        ];
        const sorted = sortArtistsByDisplayName(artists);
        expect(sorted.map(a => a.id)).toEqual(['a', 'b', 'c']);
    });

    it('handles same-name artists (stable order)', () => {
        const artists = [
            artist('x', 'Same'),
            artist('y', 'Same'),
            artist('z', 'Same'),
        ];
        const sorted = sortArtistsByDisplayName(artists);
        // When names are equal, original relative order is preserved
        expect(sorted.map(a => a.id)).toEqual(['x', 'y', 'z']);
    });

    it('is case-insensitive', () => {
        const artists = [
            artist('b', 'BETA'),
            artist('a', 'alpha'),
            artist('c', 'Gamma'),
        ];
        const sorted = sortArtistsByDisplayName(artists);
        expect(sorted.map(a => a.id)).toEqual(['a', 'b', 'c']);
    });

    it('trims whitespace before comparing', () => {
        const artists = [
            artist('b', '  alpha  '),
            artist('a', '   '),
            artist('c', 'beta'),
        ];
        const sorted = sortArtistsByDisplayName(artists);
        // empty name (a) sorts before alpha (b)
        expect(sorted.map(a => a.id)).toEqual(['a', 'b', 'c']);
    });
});
