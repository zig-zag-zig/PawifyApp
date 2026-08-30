import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createRelease, createReleaseNotificationSettings } from '../../helpers/releaseFixtures.js';

describe('release processing', () => {
    it('getNotificationCandidateReleases deduplicates by release group', async () => {
        const { getNotificationCandidateReleases } =
            await import('../../../src/features/releases/domain/releaseProcessing.js');
        const settings = createReleaseNotificationSettings({ oldestReleaseDateMonths: null });
        const releases = [
            createRelease({ id: 'rg1-a', date: '2026-01-01', releaseGroupId: 'rg-1' }),
            createRelease({ id: 'rg1-b', date: '2026-01-15', releaseGroupId: 'rg-1' }),
            createRelease({ id: 'rg2-a', date: '2026-06-01', releaseGroupId: 'rg-2' }),
            createRelease({ id: 'ungrouped', date: '2026-03-01', releaseGroupId: null }),
        ];

        const result = getNotificationCandidateReleases(releases, undefined, settings);

        // Two releases in rg-1 should be deduplicated to fewer results than input
        assert.ok(result.length < releases.length, 'grouped releases should be deduplicated');
        // Ungrouped release should be present
        assert.ok(result.some((r) => r.id === 'ungrouped'));
    });

    it('getNotificationCandidateReleases filters by notification settings', async () => {
        const { getNotificationCandidateReleases } =
            await import('../../../src/features/releases/domain/releaseProcessing.js');
        const settings = createReleaseNotificationSettings({
            oldestReleaseDateMonths: 12,
            includeReleasesWithoutDate: false,
        });
        const releases = [
            createRelease({ id: 'recent', date: '2026-01-01' }),
            createRelease({ id: 'old', date: '2020-01-01' }),
            createRelease({ id: 'no-date', date: null }),
        ];

        const result = getNotificationCandidateReleases(releases, undefined, settings);
        const resultIds = result.map((r) => r.id);

        assert.ok(resultIds.includes('recent'));
        assert.ok(!resultIds.includes('old'));
        assert.ok(!resultIds.includes('no-date'));
    });

    it('analyzeReleaseChanges detects new and deleted releases', async () => {
        const { analyzeReleaseChanges } =
            await import('../../../src/features/releases/domain/releaseProcessing.js');
        const settings = createReleaseNotificationSettings({ oldestReleaseDateMonths: null });
        const currentReleases = ['existing-1', 'deleted-1'];
        const allReleases = [
            createRelease({ id: 'existing-1', date: '2026-01-01' }),
            createRelease({ id: 'new-1', date: '2026-06-01' }),
        ];

        const result = analyzeReleaseChanges(currentReleases, allReleases, settings);

        assert.deepEqual(result.deletedReleaseIds, ['deleted-1']);
        assert.equal(result.artistNewReleases.length, 1);
        assert.equal(result.artistNewReleases[0]!.id, 'new-1');
        assert.equal(result.releasesChanged, true);
    });

    it('analyzeReleaseChanges returns no changes when everything is known', async () => {
        const { analyzeReleaseChanges } =
            await import('../../../src/features/releases/domain/releaseProcessing.js');
        const settings = createReleaseNotificationSettings({ oldestReleaseDateMonths: null });
        const currentReleases = ['release-1'];
        const allReleases = [createRelease({ id: 'release-1', date: '2026-01-01' })];

        const result = analyzeReleaseChanges(currentReleases, allReleases, settings);

        assert.deepEqual(result.deletedReleaseIds, []);
        assert.equal(result.artistNewReleases.length, 0);
        assert.equal(result.releasesChanged, false);
    });
});
