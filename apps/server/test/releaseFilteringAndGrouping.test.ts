import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Release } from '@pawify/shared';
import { releaseDateMatchesNotificationSettings } from '../src/utils/helpers/releaseNotificationFilter.js';
import {
    dedupeReleaseGroupReleases,
    groupByReleaseGroup,
    mapReleaseGroupsToArtistReleases,
    normalizeReleaseGroups,
} from '../src/utils/helpers/releaseGroupingHelpers.js';

const release = (overrides: Partial<Release> = {}): Release => {
    const id = overrides.id ?? 'release-1';
    const releaseGroupId = overrides.releaseGroupId ?? 'group-1';

    return {
        id,
        title: 'Album',
        date: '2026-01-01',
        disambiguation: null,
        artistId: 'artist-1',
        date_for_display: '01.01.2026',
        'release-group': releaseGroupId
            ? {
                  id: releaseGroupId,
                  title: 'Album',
                  date: null,
                  disambiguation: null,
                  'primary-type': 'Album',
              }
            : null,
        'artist-credit': [],
        media: [
            {
                'track-count': 2,
                tracks: [
                    { id: `${id}-track-1`, title: 'Intro', 'artist-credit': [], length: null },
                    { id: `${id}-track-2`, title: 'Finale', 'artist-credit': [], length: null },
                ],
            },
        ],
        releaseGroupId,
        cover_url: null,
        externalLinks: [],
        ...overrides,
    };
};

describe('release notification filtering', () => {
    const now = new Date('2026-05-26T12:00:00Z');

    it('honors missing-date, future-date, and age-window settings', () => {
        assert.equal(
            releaseDateMatchesNotificationSettings(
                null,
                {
                    oldestReleaseDateMonths: 12,
                    includeReleasesWithoutDate: true,
                },
                now,
            ),
            true,
        );
        assert.equal(
            releaseDateMatchesNotificationSettings(
                null,
                {
                    oldestReleaseDateMonths: 12,
                    includeReleasesWithoutDate: false,
                },
                now,
            ),
            false,
        );
        assert.equal(
            releaseDateMatchesNotificationSettings(
                '2026-05-27',
                {
                    oldestReleaseDateMonths: 12,
                    includeReleasesWithoutDate: true,
                },
                now,
            ),
            false,
        );
        assert.equal(
            releaseDateMatchesNotificationSettings(
                '2025-05-26',
                {
                    oldestReleaseDateMonths: 12,
                    includeReleasesWithoutDate: true,
                },
                now,
            ),
            true,
        );
        assert.equal(
            releaseDateMatchesNotificationSettings(
                '2025-05-25',
                {
                    oldestReleaseDateMonths: 12,
                    includeReleasesWithoutDate: true,
                },
                now,
            ),
            false,
        );
        assert.equal(
            releaseDateMatchesNotificationSettings(
                '1990-01-01',
                {
                    oldestReleaseDateMonths: null,
                    includeReleasesWithoutDate: true,
                },
                now,
            ),
            true,
        );
    });
});

describe('release grouping helpers', () => {
    it('dedupes equivalent releases by normalized title and track list', () => {
        const original = release({ id: 'original', title: ' Album ' });
        const duplicate = release({ id: 'duplicate', title: 'album' });
        const alternate = release({
            id: 'alternate',
            title: 'Album',
            media: [
                {
                    'track-count': 2,
                    tracks: [
                        {
                            id: 'alternate-track-1',
                            title: 'Intro',
                            'artist-credit': [],
                            length: null,
                        },
                        {
                            id: 'alternate-track-2',
                            title: 'Encore',
                            'artist-credit': [],
                            length: null,
                        },
                    ],
                },
            ],
        });

        const grouped = groupByReleaseGroup([original, duplicate, alternate]);

        assert.deepEqual(
            grouped.get('group-1')?.map((item) => item.id),
            ['original', 'alternate'],
        );
    });

    it('reports pruned release IDs when deduping one release group from a mixed list', () => {
        const result = dedupeReleaseGroupReleases('group-1', [
            release({ id: 'target-1', releaseGroupId: 'group-1' }),
            release({ id: 'target-duplicate', releaseGroupId: 'group-1' }),
            release({ id: 'other-group', releaseGroupId: 'group-2' }),
        ]);

        assert.deepEqual(
            result.releases.map((item) => item.id),
            ['target-1'],
        );
        assert.deepEqual(result.prunedReleaseIds.sort(), ['other-group', 'target-duplicate']);
    });

    it('normalizes missing group dates and maps groups in newest-first order', () => {
        const grouped = groupByReleaseGroup([
            release({ id: 'older', releaseGroupId: 'group-old', date: '2024-02-01' }),
            release({ id: 'newer', releaseGroupId: 'group-new', date: '2026-03-10' }),
            release({
                id: 'newest-in-old-group',
                releaseGroupId: 'group-old',
                title: 'Album Deluxe',
                date: '2025-01-01',
            }),
        ]);

        normalizeReleaseGroups(grouped);
        const groups = mapReleaseGroupsToArtistReleases(grouped);

        assert.equal(groups[0].id, 'group-new');
        assert.equal(groups[0].date, '2026-03-10');
        assert.equal(groups[1].id, 'group-old');
        assert.equal(groups[1].date, '2024-02-01');
        assert.deepEqual(groups[1].releaseIds, ['newest-in-old-group', 'older']);
    });
});
