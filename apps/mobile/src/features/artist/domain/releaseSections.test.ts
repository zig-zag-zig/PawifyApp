import { describe, expect, it } from 'vitest';
import { buildReleaseSections, buildInitialLoadedItemsByType, DEFAULT_RELEASE_ITEMS_TO_SHOW } from './releaseSections';
import type { ArtistReleaseGroup } from '@pawify/shared';

function makeReleaseGroup(id: string, primaryType: string | null): ArtistReleaseGroup {
    return {
        id,
        title: `RG ${id}`,
        date: null,
        disambiguation: null,
        'primary-type': primaryType,
        releaseIds: [],
    };
}

describe('buildReleaseSections', () => {
    it('groups by primary-type', () => {
        const groups = [
            makeReleaseGroup('1', 'Album'),
            makeReleaseGroup('2', 'Album'),
            makeReleaseGroup('3', 'Single'),
        ];
        const sections = buildReleaseSections(groups);
        expect(sections).toHaveLength(2);
        expect(sections[0].title).toBe('Album');
        expect(sections[0].releaseGroups).toHaveLength(2);
        expect(sections[1].title).toBe('Single');
        expect(sections[1].releaseGroups).toHaveLength(1);
    });

    it('sorts in canonical order (Album, Single, EP, ...)', () => {
        const groups = [
            makeReleaseGroup('1', 'EP'),
            makeReleaseGroup('2', 'Single'),
            makeReleaseGroup('3', 'Album'),
        ];
        const sections = buildReleaseSections(groups);
        expect(sections[0].title).toBe('Album');
        expect(sections[1].title).toBe('Single');
        expect(sections[2].title).toBe('EP');
    });

    it('sorts unknown types after known types, alphabetically', () => {
        const groups = [
            makeReleaseGroup('1', 'ZZZUnknown'),
            makeReleaseGroup('2', 'Album'),
            makeReleaseGroup('3', 'AAAUnknown'),
        ];
        const sections = buildReleaseSections(groups);
        expect(sections[0].title).toBe('Album');
        // Both unknown types sort after known types, alphabetically
        expect(sections[1].title).toBe('AAAUnknown');
        expect(sections[2].title).toBe('ZZZUnknown');
    });

    it('falls back null primary-type to "Other"', () => {
        const groups = [
            makeReleaseGroup('1', null),
        ];
        const sections = buildReleaseSections(groups);
        expect(sections[0].title).toBe('Other');
    });

    it('returns empty array for empty input', () => {
        expect(buildReleaseSections([])).toEqual([]);
    });

    it('preserves all release groups within a section', () => {
        const groups = [
            makeReleaseGroup('a', 'Album'),
            makeReleaseGroup('b', 'Album'),
            makeReleaseGroup('c', 'Album'),
        ];
        const sections = buildReleaseSections(groups);
        expect(sections[0].releaseGroups.map(g => g.id)).toEqual(['a', 'b', 'c']);
    });
});

describe('buildInitialLoadedItemsByType', () => {
    it('returns default counts for all canonical types', () => {
        const loaded = buildInitialLoadedItemsByType();
        expect(loaded['Album']).toBe(DEFAULT_RELEASE_ITEMS_TO_SHOW);
        expect(loaded['Single']).toBe(DEFAULT_RELEASE_ITEMS_TO_SHOW);
        expect(loaded['EP']).toBe(DEFAULT_RELEASE_ITEMS_TO_SHOW);
        expect(loaded['Other']).toBe(DEFAULT_RELEASE_ITEMS_TO_SHOW);
    });

    it('returns an object with all expected keys', () => {
        const loaded = buildInitialLoadedItemsByType();
        const keys = Object.keys(loaded);
        expect(keys).toContain('Album');
        expect(keys).toContain('Single');
        expect(keys).toContain('EP');
        expect(keys).toContain('Live');
        expect(keys).toContain('Remix');
    });

    it('DEFAULT_RELEASE_ITEMS_TO_SHOW is 10', () => {
        expect(DEFAULT_RELEASE_ITEMS_TO_SHOW).toBe(10);
    });
});
