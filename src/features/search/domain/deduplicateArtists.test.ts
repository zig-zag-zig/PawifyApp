import { describe, expect, it } from 'vitest';
import type { Artist } from '../../../shared/music';

import { deduplicateArtists, appendUniqueArtists } from './deduplicateArtists';

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

    it('returns empty array when newArtists is empty', () => {
        expect(deduplicateArtists([], [artist('a')])).toEqual([]);
    });

    it('returns all newArtists when existingArtists is empty', () => {
        const result = deduplicateArtists([artist('a'), artist('b')], []);
        expect(result.map(a => a.id)).toEqual(['a', 'b']);
    });

    it('returns empty when all newArtists are duplicates', () => {
        const result = deduplicateArtists(
            [artist('a'), artist('b')],
            [artist('a'), artist('b'), artist('c')],
        );
        expect(result).toEqual([]);
    });

    it('keeps all when no duplicates', () => {
        const result = deduplicateArtists(
            [artist('a'), artist('b')],
            [artist('c'), artist('d')],
        );
        expect(result.map(a => a.id)).toEqual(['a', 'b']);
    });
});

describe('appendUniqueArtists', () => {
    it('adds only unseen artists to target', () => {
        const target = [artist('a')];
        const seen = new Set(['a']);
        const added = appendUniqueArtists(target, [artist('a'), artist('b'), artist('c')], seen);
        expect(target.map(a => a.id)).toEqual(['a', 'b', 'c']);
        expect(added.map(a => a.id)).toEqual(['b', 'c']);
    });

    it('returns empty added when all artists are seen', () => {
        const target: Artist[] = [];
        const seen = new Set(['a', 'b']);
        const added = appendUniqueArtists(target, [artist('a'), artist('b')], seen);
        expect(target).toEqual([]);
        expect(added).toEqual([]);
    });

    it('adds all artists when none are seen', () => {
        const target: Artist[] = [];
        const seen = new Set<string>();
        const added = appendUniqueArtists(target, [artist('a'), artist('b')], seen);
        expect(target.map(a => a.id)).toEqual(['a', 'b']);
        expect(added.map(a => a.id)).toEqual(['a', 'b']);
    });

    it('handles empty artists array', () => {
        const target = [artist('a')];
        const seen = new Set(['a']);
        const added = appendUniqueArtists(target, [], seen);
        expect(target.map(a => a.id)).toEqual(['a']);
        expect(added).toEqual([]);
    });
});
