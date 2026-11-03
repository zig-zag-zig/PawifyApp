import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    analyzeReleaseGroupChanges,
    buildReleaseToGroupMap,
    planArtistScan,
    translateKnownIdsToGroupIds,
    type ReleaseGroupCandidate,
} from '../../../src/features/releases/domain/releaseGroupProcessing.js';

const group = (
    id: string,
    date: string | null,
    overrides: Partial<ReleaseGroupCandidate> = {},
): ReleaseGroupCandidate => ({
    id,
    title: `Group ${id}`,
    date,
    disambiguation: null,
    primaryType: 'Album',
    releaseIds: [`release-${id}`],
    newestReleaseId: `release-${id}`,
    ...overrides,
});

// Fixed clock so the date window is deterministic.
const NOW = new Date('2026-06-01T00:00:00Z');
const twelveMonths = { oldestReleaseDateMonths: 12, includeReleasesWithoutDate: true };
const recentTwelveMonths = {
    oldestReleaseDateMonths: 12,
    includeReleasesWithoutDate: false,
};

describe('analyzeReleaseGroupChanges', () => {
    it('reports a group that is not known yet', () => {
        const changes = analyzeReleaseGroupChanges(
            [],
            [group('a', '2026-05-01')],
            twelveMonths,
            NOW,
        );

        assert.deepEqual(
            changes.newGroups.map((entry) => entry.id),
            ['a'],
        );
        assert.deepEqual(changes.prunedGroupIds, []);
        assert.equal(changes.groupsChanged, true);
    });

    it('treats three pressings of one album as one new group', () => {
        // The whole point of the migration: before this, each pressing notified.
        const album = group('a', '2026-05-01', {
            releaseIds: ['release-1', 'release-2', 'release-3'],
            newestReleaseId: 'release-3',
        });

        const changes = analyzeReleaseGroupChanges([], [album], twelveMonths, NOW);

        assert.equal(changes.newGroups.length, 1);
        assert.equal(changes.newGroups[0].newestReleaseId, 'release-3');
        assert.deepEqual(changes.newGroups[0].releaseIds, ['release-1', 'release-2', 'release-3']);
    });

    it('stays silent for a group that is already known', () => {
        const changes = analyzeReleaseGroupChanges(
            ['a'],
            [group('a', '2026-05-01')],
            twelveMonths,
            NOW,
        );

        assert.deepEqual(changes.newGroups, []);
        assert.equal(changes.groupsChanged, false);
    });

    it('prunes a known group that left the catalog', () => {
        // The catalog still has data, so this is a real deletion, not a data outage.
        const changes = analyzeReleaseGroupChanges(
            ['gone', 'here'],
            [group('here', '2026-05-01')],
            twelveMonths,
            NOW,
        );

        assert.deepEqual(changes.deletedGroupIds, ['gone']);
        assert.deepEqual(changes.prunedGroupIds, ['gone']);
        assert.equal(changes.groupsChanged, true);
    });

    it('does not notify a group outside the date window', () => {
        const changes = analyzeReleaseGroupChanges(
            [],
            [group('old', '2019-01-01')],
            recentTwelveMonths,
            NOW,
        );

        assert.deepEqual(changes.newGroups, []);
        assert.equal(changes.groupsChanged, false);
    });

    it('does not notify a future release, but keeps it out of the known set', () => {
        const changes = analyzeReleaseGroupChanges(
            [],
            [group('future', '2026-12-01')],
            twelveMonths,
            NOW,
        );

        assert.deepEqual(changes.newGroups, []);
        assert.equal(changes.groupsChanged, false);
    });

    it('prunes a known group that fell out of the date window', () => {
        // The user narrowed their window; the group is known but no longer eligible.
        const changes = analyzeReleaseGroupChanges(
            ['a'],
            [group('a', '2019-01-01')],
            recentTwelveMonths,
            NOW,
        );

        assert.deepEqual(changes.filteredOutGroupIds, ['a']);
        assert.deepEqual(changes.deletedGroupIds, []);
        assert.deepEqual(changes.newGroups, []);
        assert.equal(changes.groupsChanged, true);
    });

    it('honours includeReleasesWithoutDate', () => {
        const included = analyzeReleaseGroupChanges([], [group('nodate', null)], twelveMonths, NOW);
        const excluded = analyzeReleaseGroupChanges(
            [],
            [group('nodate', null)],
            recentTwelveMonths,
            NOW,
        );

        assert.equal(included.newGroups.length, 1);
        assert.equal(excluded.newGroups.length, 0);
    });

    it('orders new groups newest first', () => {
        const changes = analyzeReleaseGroupChanges(
            [],
            [group('old', '2025-06-01'), group('new', '2026-05-01'), group('mid', '2025-08-01')],
            twelveMonths,
            NOW,
        );

        assert.deepEqual(
            changes.newGroups.map((entry) => entry.id),
            ['new', 'mid', 'old'],
        );
    });

    it('never prunes from an empty catalog', () => {
        // An empty catalog means "no data", not "the artist deleted everything".
        // Pruning here would empty the user's history and re-notify on recovery.
        const changes = analyzeReleaseGroupChanges(['a', 'b'], [], twelveMonths, NOW);

        assert.deepEqual(changes.prunedGroupIds, []);
        assert.deepEqual(changes.deletedGroupIds, []);
        assert.equal(changes.groupsChanged, false);
    });

    it('ignores duplicate known ids instead of double counting', () => {
        const changes = analyzeReleaseGroupChanges(
            ['a', 'a'],
            [group('a', '2026-05-01')],
            twelveMonths,
            NOW,
        );

        assert.deepEqual(changes.newGroups, []);
        assert.equal(changes.groupsChanged, false);
    });
});

describe('translateKnownIdsToGroupIds', () => {
    it('maps legacy release ids onto their release groups', () => {
        const translated = translateKnownIdsToGroupIds(
            ['release-1', 'release-2'],
            new Map([
                ['release-1', 'group-a'],
                ['release-2', 'group-a'],
            ]),
        );

        // Two pressings of one album collapse into one known group.
        assert.deepEqual(translated, ['group-a']);
    });

    it('leaves an id that is already a group id alone', () => {
        // What makes the migration idempotent: a group id is not a release, so the
        // lookup misses and the id survives unchanged. No version marker needed and
        // no second re-notification window.
        const translated = translateKnownIdsToGroupIds(['group-a'], new Map());

        assert.deepEqual(translated, ['group-a']);
    });

    it('is stable when run twice', () => {
        const map = new Map([['release-1', 'group-a']]);
        const once = translateKnownIdsToGroupIds(['release-1', 'group-b'], map);
        const twice = translateKnownIdsToGroupIds(once, map);

        assert.deepEqual(once, ['group-a', 'group-b']);
        assert.deepEqual(twice, once);
    });

    it('keeps the id when the release is unknown to the mirror', () => {
        // Deleted releases keep their id so the existing prune path removes them.
        const translated = translateKnownIdsToGroupIds(['deleted-release'], new Map());

        assert.deepEqual(translated, ['deleted-release']);
    });
});
describe('planArtistScan', () => {
    const albumWithThreePressings = group('a', '2026-05-01', {
        releaseIds: ['release-1', 'release-2', 'release-3'],
        newestReleaseId: 'release-3',
    });

    it('does not re-notify a group the user already knows through a pressing', () => {
        // The migration case: this user's stored history is release ids from before
        // the switch. One of them belongs to the album, so the album is known.
        const plan = planArtistScan(['release-2'], [albumWithThreePressings], twelveMonths, NOW);

        assert.deepEqual(plan.newGroups, []);
        assert.deepEqual(plan.knownGroupIds, ['a']);
        assert.deepEqual(plan.groupIdsToSave, ['a']);
        assert.equal(plan.groupsChanged, false);
    });

    it('notifies a group whose pressings are all unknown', () => {
        const plan = planArtistScan([], [albumWithThreePressings], twelveMonths, NOW);

        assert.deepEqual(
            plan.newGroups.map((entry) => entry.id),
            ['a'],
        );
        assert.deepEqual(plan.groupIdsToSave, ['a']);
        assert.equal(plan.groupsChanged, true);
    });

    it('collapses several known pressings into one known group', () => {
        const plan = planArtistScan(
            ['release-1', 'release-2', 'release-3'],
            [albumWithThreePressings],
            twelveMonths,
            NOW,
        );

        assert.deepEqual(plan.knownGroupIds, ['a']);
        assert.deepEqual(plan.groupIdsToSave, ['a']);
        assert.deepEqual(plan.newGroups, []);
    });

    it('keeps known groups and drops pruned ones in one pass', () => {
        const plan = planArtistScan(
            ['release-1', 'deleted-release'],
            [albumWithThreePressings],
            twelveMonths,
            NOW,
        );

        // The known group survives; the vanished release id is pruned.
        assert.deepEqual(plan.groupIdsToSave, ['a']);
        assert.deepEqual(plan.prunedGroupIds, ['deleted-release']);
        assert.equal(plan.groupsChanged, true);
    });

    it('is idempotent: the second scan plans nothing', () => {
        const first = planArtistScan(['release-1'], [albumWithThreePressings], twelveMonths, NOW);
        const second = planArtistScan(
            first.groupIdsToSave,
            [albumWithThreePressings],
            twelveMonths,
            NOW,
        );

        assert.deepEqual(second.newGroups, []);
        assert.equal(second.groupsChanged, false);
        assert.deepEqual(second.groupIdsToSave, first.groupIdsToSave);
    });

    it('maps every pressing of a group to that group', () => {
        const map = buildReleaseToGroupMap([albumWithThreePressings]);

        assert.deepEqual(Array.from(map.entries()).sort(), [
            ['release-1', 'a'],
            ['release-2', 'a'],
            ['release-3', 'a'],
        ]);
    });
});
