import { describe, expect, it } from 'vitest';
import type { NewReleaseListItem } from '../../../contexts/NewReleasesContext';

import { canLoadMoreReleases, paginateReleases } from './paginateReleases';

const release = (id: string): NewReleaseListItem => ({
    id,
    title: id,
    date: '2026-01-01',
    date_for_display: '01.01.2026',
    artists: {},
    cover_url: null,
    disambiguation: null,
    'primary-type': 'Album',
});

describe('release pagination helpers', () => {
    it('returns cumulative pages and reports when more releases are available', () => {
        const releases = ['a', 'b', 'c', 'd', 'e'].map(release);

        expect(paginateReleases(releases, 0, 2).map(item => item.id)).toEqual(['a', 'b']);
        expect(canLoadMoreReleases(releases, 0, 2)).toBe(true);

        expect(paginateReleases(releases, 1, 2).map(item => item.id)).toEqual(['a', 'b', 'c', 'd']);
        expect(canLoadMoreReleases(releases, 1, 2)).toBe(true);

        expect(paginateReleases(releases, 2, 2).map(item => item.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
        expect(canLoadMoreReleases(releases, 2, 2)).toBe(false);
    });
});
