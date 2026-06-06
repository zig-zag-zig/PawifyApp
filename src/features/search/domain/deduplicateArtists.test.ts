import { describe, expect, it } from 'vitest';
import type { Artist } from '../../../modules/models/models';

import { deduplicateArtists } from './deduplicateArtists';

const artist = (id: string, name = id): Artist => ({
    id,
    name,
    type: 'Person',
    disambiguation: null,
    aliases: [],
    members: [],
    externalLinks: [],
    lifeSpan: {
        begin: null,
        end: null,
        ended: false,
    },
    beginArea: {
        name: null,
    },
});

describe('artist deduplication', () => {
    it('keeps only artists that are not already present by id', () => {
        expect(deduplicateArtists(
            [artist('existing', 'New Name'), artist('new')],
            [artist('existing', 'Existing Name')],
        ).map(item => item.id)).toEqual(['new']);
    });
});
