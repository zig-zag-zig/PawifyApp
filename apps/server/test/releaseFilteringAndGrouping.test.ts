import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Release } from '@pawify/shared';
import { releaseDateMatchesNotificationSettings } from '../src/utils/helpers/releaseNotificationFilter.js';
import {
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
        media: [],
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
    it('keeps every release in a release group without track-title deduplication', () => {
        const first = release({ id: 'first', title: 'Album' });
        const second = release({ id: 'second', title: 'album' });
        const withoutGroup = release({
            id: 'no-group',
            releaseGroupId: null,
            'release-group': null,
        });

        const grouped = groupByReleaseGroup([first, second, withoutGroup]);

        assert.deepEqual(
            grouped.get('group-1')?.map((item) => item.id),
            ['first', 'second'],
        );
        assert.equal(grouped.size, 1);
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
