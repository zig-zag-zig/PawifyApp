import { describe, expect, it } from 'vitest';

import { sortArtistsByDisplayName } from './sortArtists';

describe('artist sorting', () => {
    it('sorts by trimmed display name without mutating the original list', () => {
        const artists = [
            { id: 'b', name: '  Beta' },
            { id: 'a', name: 'alpha' },
            { id: 'g', name: 'Gamma' },
        ];

        const sorted = sortArtistsByDisplayName(artists);

        expect(sorted.map(artist => artist.id)).toEqual(['a', 'b', 'g']);
        expect(artists.map(artist => artist.id)).toEqual(['b', 'a', 'g']);
    });
});
