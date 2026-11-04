import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    RELEASE_EVENT_WINDOW_DAYS,
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
    newestReleaseDate: date,
    ...overrides,
});

// Fixed clock so the date window is deterministic.
const NOW = new Date('2026-06-01T00:00:00Z');
const twelveMonths = { oldestReleaseDateMonths: 12, includeReleasesWithoutDate: true };
const recentTwelveMonths = { oldestReleaseDateMonths: 12, includeReleasesWithoutDate: false };

const known = (entries: [string, string][]): Map<string, string> => new Map(entries);

describe('analyzeReleaseGroupChanges', () => {
    it('reports a group that is not known yet', () => {
        const changes = analyzeReleaseGroupChanges(
            known([]),
            [group('a', '2026-05-01')],
            twelveMonths,
            NOW,
        );

        assert.deepEqual(
            changes.newEvents.map((entry) => entry.id),
            ['a'],
        );
        assert.deepEqual(changes.prunedGroupIds, []);
        assert.equal(changes.groupState.get('a'), '2026-05-01');
        assert.equal(changes.groupsChanged, true);
    });

    it('treats three pressings of one album as one event', () => {
        const album = group('a', '2026-05-01', {
            releaseIds: ['release-1', 'release-2', 'release-3'],
            newestReleaseId: 'release-3',
            newestReleaseDate: '2026-05-03',
        });

        const changes = analyzeReleaseGroupChanges(known([]), [album], twelveMonths, NOW);

        assert.equal(changes.newEvents.length, 1);
        assert.equal(changes.newEvents[0].newestReleaseId, 'release-3');
    });

    it('stays silent when a known group gains a pressing inside the window', () => {
        // The same album, three weeks later: same event.
        const changes = analyzeReleaseGroupChanges(
            known([['a', '2026-05-01']]),
            [group('a', '2026-05-01', { newestReleaseDate: '2026-05-22' })],
            twelveMonths,
            NOW,
        );

        assert.deepEqual(changes.newEvents, []);
        // The stored event date does not move: suppressed pressings must not extend
        // the window.
        assert.equal(changes.groupState.get('a'), '2026-05-01');
        assert.equal(changes.groupsChanged, false);
    });

    it('notifies for a pressing outside the window', () => {
        // A deluxe/remaster two years later is a real release event.
        const changes = analyzeReleaseGroupChanges(
            known([['a', '2024-05-01']]),
            [group('a', '2024-05-01', { newestReleaseDate: '2026-04-01' })],
            twelveMonths,
            NOW,
        );

        assert.deepEqual(
            changes.newEvents.map((entry) => entry.id),
            ['a'],
        );
        assert.equal(changes.groupState.get('a'), '2026-04-01');
    });

    it('uses the inclusive window boundary', () => {
        // Exactly 45 days later still belongs to the same event.
        const inside = analyzeReleaseGroupChanges(
            known([['a', '2026-03-01']]),
            [group('a', '2026-03-01', { newestReleaseDate: '2026-04-15' })],
            twelveMonths,
            NOW,
        );
        // One day past the window is a new event.
        const outside = analyzeReleaseGroupChanges(
            known([['a', '2026-03-01']]),
            [group('a', '2026-03-01', { newestReleaseDate: '2026-04-16' })],
            twelveMonths,
            NOW,
        );

        assert.deepEqual(inside.newEvents, []);
        assert.equal(outside.newEvents.length, 1);
        assert.equal(RELEASE_EVENT_WINDOW_DAYS, 45);
    });

    it('does not let a stream of junk pressings silence a later real release', () => {
        // Pressings at day 40 and day 80 relative to the notified event. Day 80 is
        // outside the window of the *notified* event, so it notifies; had the
        // suppressed day-40 pressing moved the watermark, day 80 would have been
        // swallowed too.
        const afterFirstSuppressed = analyzeReleaseGroupChanges(
            known([['a', '2026-01-01']]),
            [group('a', '2026-01-01', { newestReleaseDate: '2026-02-10' })],
            twelveMonths,
            NOW,
        );
        const afterSecond = analyzeReleaseGroupChanges(
            known([['a', afterFirstSuppressed.groupState.get('a')!]]),
            [group('a', '2026-01-01', { newestReleaseDate: '2026-03-22' })],
            twelveMonths,
            NOW,
        );

        assert.deepEqual(afterFirstSuppressed.newEvents, []);
        assert.equal(afterFirstSuppressed.groupState.get('a'), '2026-01-01');
        assert.equal(afterSecond.newEvents.length, 1);
    });

    it('baselines a migrated group instead of notifying', () => {
        // '' marks a group carried over from the release-id era: known, no date.
        const changes = analyzeReleaseGroupChanges(
            known([['a', '']]),
            [group('a', '2026-05-01')],
            twelveMonths,
            NOW,
        );

        assert.deepEqual(changes.newEvents, []);
        assert.deepEqual(changes.baselinedGroupIds, ['a']);
        assert.equal(changes.groupState.get('a'), '2026-05-01');
        assert.equal(changes.groupsChanged, true);
    });

    it('prunes a known group that left the catalog', () => {
        const changes = analyzeReleaseGroupChanges(
            known([
                ['gone', '2026-01-01'],
                ['here', '2026-05-01'],
            ]),
            [group('here', '2026-05-01')],
            twelveMonths,
            NOW,
        );

        assert.deepEqual(changes.deletedGroupIds, ['gone']);
        assert.deepEqual(changes.prunedGroupIds, ['gone']);
        assert.equal(changes.groupState.has('gone'), false);
    });

    it('does not notify a group outside the date window', () => {
        const changes = analyzeReleaseGroupChanges(
            known([]),
            [group('old', '2019-01-01')],
            recentTwelveMonths,
            NOW,
        );

        assert.deepEqual(changes.newEvents, []);
        assert.equal(changes.groupsChanged, false);
    });

    it('prunes a known group that fell out of the date window', () => {
        const changes = analyzeReleaseGroupChanges(
            known([['a', '2019-01-01']]),
            [group('a', '2019-01-01')],
            recentTwelveMonths,
            NOW,
        );

        assert.deepEqual(changes.filteredOutGroupIds, ['a']);
        assert.deepEqual(changes.newEvents, []);
    });

    it('honours includeReleasesWithoutDate', () => {
        const included = analyzeReleaseGroupChanges(
            known([]),
            [group('nodate', null)],
            twelveMonths,
            NOW,
        );
        const excluded = analyzeReleaseGroupChanges(
            known([]),
            [group('nodate', null)],
            recentTwelveMonths,
            NOW,
        );

        assert.equal(included.newEvents.length, 1);
        assert.equal(excluded.newEvents.length, 0);
    });

    it('stays silent when neither date is known, rather than guessing', () => {
        const changes = analyzeReleaseGroupChanges(
            known([['a', '2025-01-01']]),
            [group('a', null, { newestReleaseDate: null })],
            twelveMonths,
            NOW,
        );

        // No date means no way to tell events apart; skipping is never wrong.
        assert.deepEqual(changes.newEvents, []);
        assert.equal(changes.groupState.get('a'), '2025-01-01');
    });

    it('orders new events newest first', () => {
        const changes = analyzeReleaseGroupChanges(
            known([]),
            [group('old', '2025-06-01'), group('new', '2026-05-01'), group('mid', '2025-08-01')],
            twelveMonths,
            NOW,
        );

        assert.deepEqual(
            changes.newEvents.map((entry) => entry.id),
            ['new', 'mid', 'old'],
        );
    });

    it('never prunes from an empty catalog', () => {
        const changes = analyzeReleaseGroupChanges(
            known([
                ['a', '2026-01-01'],
                ['b', '2026-01-01'],
            ]),
            [],
            twelveMonths,
            NOW,
        );

        assert.deepEqual(changes.prunedGroupIds, []);
        assert.deepEqual(changes.newEvents, []);
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

        assert.deepEqual(translated, ['group-a']);
    });

    it('leaves an id that is already a group id alone', () => {
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
        const translated = translateKnownIdsToGroupIds(['deleted-release'], new Map());

        assert.deepEqual(translated, ['deleted-release']);
    });
});

describe('planArtistScan', () => {
    const album = group('a', '2026-05-01', {
        releaseIds: ['release-1', 'release-2', 'release-3'],
        newestReleaseId: 'release-3',
        newestReleaseDate: '2026-05-01',
    });

    it('does not re-notify a group the user already knows through a pressing', () => {
        const plan = planArtistScan(known([['release-2', '']]), [album], twelveMonths, NOW);

        assert.deepEqual(plan.newEvents, []);
        assert.deepEqual(plan.knownGroupIds, ['a']);
        assert.equal(plan.groupState.get('a'), '2026-05-01');
        assert.equal(plan.groupsChanged, true);
    });

    it('notifies a group whose pressings are all unknown', () => {
        const plan = planArtistScan(known([]), [album], twelveMonths, NOW);

        assert.deepEqual(
            plan.newEvents.map((entry) => entry.id),
            ['a'],
        );
        assert.equal(plan.groupsChanged, true);
    });

    it('collapses several known pressings into one known group', () => {
        const plan = planArtistScan(
            known([
                ['release-1', ''],
                ['release-2', ''],
                ['release-3', ''],
            ]),
            [album],
            twelveMonths,
            NOW,
        );

        assert.deepEqual(plan.knownGroupIds, ['a']);
        assert.deepEqual(plan.newEvents, []);
    });

    it('keeps known groups and drops pruned ones in one pass', () => {
        const plan = planArtistScan(
            known([
                ['release-1', ''],
                ['deleted-release', ''],
            ]),
            [album],
            twelveMonths,
            NOW,
        );

        assert.equal(plan.groupState.has('a'), true);
        assert.deepEqual(plan.prunedGroupIds, ['deleted-release']);
    });

    it('is idempotent: a second scan plans nothing', () => {
        const first = planArtistScan(known([['release-1', '']]), [album], twelveMonths, NOW);
        const second = planArtistScan(first.groupState, [album], twelveMonths, NOW);

        assert.deepEqual(second.newEvents, []);
        assert.equal(second.groupsChanged, false);
    });

    it('maps every pressing of a group to that group', () => {
        const map = buildReleaseToGroupMap([album]);

        assert.deepEqual(Array.from(map.entries()).sort(), [
            ['release-1', 'a'],
            ['release-2', 'a'],
            ['release-3', 'a'],
        ]);
    });
});
