import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    analyzeReleaseGroupChanges,
    emptyKnownReleaseGroupState,
    planArtistScan,
    type KnownReleaseGroupStateValue,
    type ReleaseEditionCandidate,
    type ReleaseGroupCandidate,
} from '../../../src/features/releases/domain/releaseGroupProcessing.js';
import {
    extractEditionKeywords,
    normalizeEditionKeywords,
} from '../../../src/features/releases/domain/releaseEditionKeywords.js';

const edition = (
    releaseId: string,
    overrides: Partial<ReleaseEditionCandidate> = {},
): ReleaseEditionCandidate => ({
    releaseId,
    date: '2026-05-01',
    status: 'Official',
    trackCount: 12,
    formats: ['CD'],
    title: 'Album',
    disambiguation: null,
    editionKeywords: [],
    ...overrides,
});

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
    officialEditions: [],
    ...overrides,
});

/** A group with one Official pressing carrying explicit edition metadata. */
const groupWithEditions = (
    id: string,
    editions: ReleaseEditionCandidate[],
    overrides: Partial<ReleaseGroupCandidate> = {},
): ReleaseGroupCandidate =>
    group(id, editions[0]?.date ?? null, {
        releaseIds: editions.map((entry) => entry.releaseId),
        newestReleaseId: editions[editions.length - 1]?.releaseId ?? `release-${id}`,
        newestReleaseDate: editions[editions.length - 1]?.date ?? null,
        officialEditions: editions,
        ...overrides,
    });

// Fixed clock so the date filter is deterministic.
const NOW = new Date('2026-06-01T00:00:00Z');
const twelveMonths = { oldestReleaseDateMonths: 12, includeReleasesWithoutDate: true };
const recentTwelveMonths = { oldestReleaseDateMonths: 12, includeReleasesWithoutDate: false };

const known = (
    entries: [string, KnownReleaseGroupStateValue][],
): Map<string, KnownReleaseGroupStateValue> => new Map(entries);

const baselined = (
    lastNotifiedDate: string | null,
    maxOfficialTrackCount: number | null,
    editionKeywords: string[] = [],
): KnownReleaseGroupStateValue => ({
    lastNotifiedDate,
    maxOfficialTrackCount,
    editionKeywords,
});

describe('extractEditionKeywords', () => {
    it('matches whole tokens only, not substrings of unrelated words', () => {
        assert.deepEqual(extractEditionKeywords('Deluxe Edition', null), ['deluxe']);
        assert.deepEqual(extractEditionKeywords('Master of Puppets', null), []);
        assert.deepEqual(extractEditionKeywords('Deluxes', null), []);
    });

    it('normalizes unicode and case', () => {
        assert.deepEqual(extractEditionKeywords('DÉLUXE', null), ['deluxe']);
    });

    it('deduplicates and orders keywords canonically across both fields', () => {
        assert.deepEqual(
            extractEditionKeywords('Album (Deluxe Remastered)', 'deluxe bonus'),
            ['deluxe', 'remastered', 'bonus'],
        );
    });

    it('returns keywords in canonical order regardless of input order', () => {
        assert.deepEqual(
            normalizeEditionKeywords(['bonus', 'deluxe']),
            normalizeEditionKeywords(['deluxe', 'bonus']),
        );
    });
});

describe('analyzeReleaseGroupChanges', () => {
    it('reports a genuinely new group with an Official release', () => {
        const changes = analyzeReleaseGroupChanges(
            known([]),
            [groupWithEditions('a', [edition('r1')])],
            twelveMonths,
            NOW,
        );

        assert.deepEqual(
            changes.newEvents.map((entry) => entry.group.id),
            ['a'],
        );
        assert.equal(changes.newEvents[0]?.reason, 'new-group');
        assert.equal(changes.newEvents[0]?.edition?.releaseId, 'r1');
        assert.deepEqual(changes.prunedGroupIds, []);
        assert.equal(changes.groupState.get('a')?.lastNotifiedDate, '2026-05-01');
        assert.equal(changes.groupState.get('a')?.maxOfficialTrackCount, 12);
        assert.equal(changes.groupsChanged, true);
    });

    it('treats three identical Official pressings as one event', () => {
        const album = groupWithEditions('a', [
            edition('release-1'),
            edition('release-2', { formats: ['Digital Media'] }),
            edition('release-3', { date: '2026-05-03' }),
        ]);

        const changes = analyzeReleaseGroupChanges(known([]), [album], twelveMonths, NOW);

        assert.equal(changes.newEvents.length, 1);
        assert.equal(changes.newEvents[0]?.group.id, 'a');
    });

    it('stays silent when a known group gains a pressing with identical content', () => {
        const album = groupWithEditions('a', [
            edition('release-1'),
            edition('release-2', { date: '2026-05-22' }),
        ]);

        const changes = analyzeReleaseGroupChanges(
            known([['a', baselined('2026-05-01', 12)]]),
            [album],
            twelveMonths,
            NOW,
        );

        assert.deepEqual(changes.newEvents, []);
        assert.deepEqual(changes.groupState.get('a'), baselined('2026-05-01', 12));
        assert.equal(changes.groupsChanged, false);
    });

    it('notifies when an Official edition has more tracks', () => {
        const album = groupWithEditions('a', [
            edition('release-1'),
            edition('release-2', { date: '2026-05-20', trackCount: 18 }),
        ]);

        const changes = analyzeReleaseGroupChanges(
            known([['a', baselined('2026-05-01', 12)]]),
            [album],
            twelveMonths,
            NOW,
        );

        assert.equal(changes.newEvents.length, 1);
        assert.equal(changes.newEvents[0]?.reason, 'more-tracks');
        assert.equal(changes.newEvents[0]?.trackCount, 18);
        // The edition that caused the event, not the newest pressing by default.
        assert.equal(changes.newEvents[0]?.edition?.releaseId, 'release-2');
        assert.equal(changes.groupState.get('a')?.maxOfficialTrackCount, 18);
    });

    it('notifies when an Official edition adds a deluxe keyword', () => {
        const album = groupWithEditions('a', [
            edition('release-1'),
            edition('release-2', {
                date: '2026-05-20',
                title: 'Album (Deluxe Edition)',
                editionKeywords: ['deluxe'],
            }),
        ]);

        const changes = analyzeReleaseGroupChanges(
            known([['a', baselined('2026-05-01', 12)]]),
            [album],
            twelveMonths,
            NOW,
        );

        assert.equal(changes.newEvents.length, 1);
        assert.equal(changes.newEvents[0]?.reason, 'new-edition');
        assert.deepEqual(changes.newEvents[0]?.editionKeywords, ['deluxe']);
        assert.equal(changes.newEvents[0]?.edition?.releaseId, 'release-2');
    });

    it('notifies with reason new-edition when only a keyword is new', () => {
        const album = groupWithEditions('a', [
            edition('release-1'),
            edition('release-2', {
                date: '2026-05-20',
                title: 'Album (Deluxe Edition)',
                editionKeywords: ['deluxe'],
            }),
        ]);

        const changes = analyzeReleaseGroupChanges(
            known([['a', baselined('2026-05-01', 12, ['remaster'])]]),
            [album],
            twelveMonths,
            NOW,
        );

        assert.equal(changes.newEvents.length, 1);
        assert.equal(changes.newEvents[0]?.reason, 'new-edition');
        assert.deepEqual(changes.newEvents[0]?.editionKeywords, ['deluxe']);
        assert.equal(changes.newEvents[0]?.edition?.releaseId, 'release-2');
        assert.deepEqual(changes.groupState.get('a')?.editionKeywords, ['deluxe', 'remaster']);
    });

    it('does not re-notify an already seen keyword', () => {
        const album = groupWithEditions('a', [
            edition('release-1', {
                title: 'Album (Deluxe Edition)',
                editionKeywords: ['deluxe'],
            }),
        ]);

        const changes = analyzeReleaseGroupChanges(
            known([['a', baselined('2026-05-01', 12, ['deluxe'])]]),
            [album],
            twelveMonths,
            NOW,
        );

        assert.deepEqual(changes.newEvents, []);
    });

    it('ignores a barcode-only change', () => {
        // Barcodes are not part of the candidate at all; a new pressing with the
        // same Official content must stay silent.
        const album = groupWithEditions('a', [
            edition('release-1'),
            edition('release-2', { date: '2026-05-10' }),
        ]);

        const changes = analyzeReleaseGroupChanges(
            known([['a', baselined('2026-05-01', 12)]]),
            [album],
            twelveMonths,
            NOW,
        );

        assert.deepEqual(changes.newEvents, []);
        assert.equal(changes.groupsChanged, false);
    });

    it('ignores a format-only change', () => {
        const album = groupWithEditions('a', [
            edition('release-1', { formats: ['CD'] }),
            edition('release-2', { date: '2026-05-10', formats: ['Vinyl'] }),
        ]);

        const changes = analyzeReleaseGroupChanges(
            known([['a', baselined('2026-05-01', 12)]]),
            [album],
            twelveMonths,
            NOW,
        );

        assert.deepEqual(changes.newEvents, []);
    });

    it('never lets a non-Official release trigger an event', () => {
        // Bootleg with more tracks and a deluxe keyword is still not an event.
        const album = groupWithEditions(
            'a',
            [
                edition('release-1'),
                edition('release-2', {
                    date: '2026-05-20',
                    status: 'Bootleg',
                    trackCount: 30,
                    title: 'Album (Deluxe)',
                    editionKeywords: ['deluxe'],
                }),
            ],
            { officialEditions: [edition('release-1')] },
        );

        const changes = analyzeReleaseGroupChanges(
            known([['a', baselined('2026-05-01', 12)]]),
            [album],
            twelveMonths,
            NOW,
        );

        assert.deepEqual(changes.newEvents, []);
        assert.equal(changes.groupState.get('a')?.maxOfficialTrackCount, 12);
    });

    it('ignores non-Official editions even when the source forgets to filter', () => {
        const album = groupWithEditions('a', [
            edition('release-1', { status: 'Bootleg', trackCount: 30 }),
        ]);

        const changes = analyzeReleaseGroupChanges(known([]), [album], twelveMonths, NOW);

        assert.deepEqual(changes.newEvents, []);
        assert.equal(changes.groupState.get('a')?.maxOfficialTrackCount, null);
    });

    it('does not notify for a group that only has non-Official releases', () => {
        const changes = analyzeReleaseGroupChanges(
            known([]),
            [
                groupWithEditions('a', [
                    edition('release-1', { status: 'Promotion' }),
                    edition('release-2', { status: 'Bootleg' }),
                ]),
            ],
            twelveMonths,
            NOW,
        );

        assert.deepEqual(changes.newEvents, []);
        // The group is still recorded as known and baselined empty.
        assert.equal(changes.groupState.get('a')?.lastNotifiedDate, null);
        assert.equal(changes.groupState.get('a')?.maxOfficialTrackCount, null);
        assert.deepEqual(changes.groupState.get('a')?.editionKeywords, []);
    });

    it('baselines a group migrated from release-id state without notifying', () => {
        const changes = analyzeReleaseGroupChanges(
            known([['a', emptyKnownReleaseGroupState('', false)]]),
            [groupWithEditions('a', [edition('release-1', { trackCount: 15 })])],
            twelveMonths,
            NOW,
        );

        assert.deepEqual(changes.newEvents, []);
        assert.deepEqual(changes.baselinedGroupIds, ['a']);
        assert.equal(changes.groupState.get('a')?.lastNotifiedDate, '');
        assert.equal(changes.groupState.get('a')?.maxOfficialTrackCount, 15);
        assert.equal(changes.groupsChanged, true);
    });

    it('baselines legacy group/date state silently', () => {
        const changes = analyzeReleaseGroupChanges(
            known([['a', emptyKnownReleaseGroupState('2026-05-01', false)]]),
            [
                groupWithEditions('a', [
                    edition('release-1', {
                        title: 'Album (Deluxe)',
                        trackCount: 18,
                        editionKeywords: ['deluxe'],
                    }),
                ]),
            ],
            twelveMonths,
            NOW,
        );

        assert.deepEqual(changes.newEvents, []);
        assert.deepEqual(changes.baselinedGroupIds, ['a']);
        assert.equal(changes.groupState.get('a')?.maxOfficialTrackCount, 18);
        assert.deepEqual(changes.groupState.get('a')?.editionKeywords, ['deluxe']);
    });

    it('is idempotent: a second scan of the same catalog plans nothing', () => {
        const album = groupWithEditions('a', [edition('release-1', { trackCount: 15 })]);

        const first = analyzeReleaseGroupChanges(known([]), [album], twelveMonths, NOW);
        const second = analyzeReleaseGroupChanges(
            new Map(first.groupState),
            [album],
            twelveMonths,
            NOW,
        );

        assert.deepEqual(second.newEvents, []);
        assert.deepEqual(second.baselinedGroupIds, []);
        assert.equal(second.groupsChanged, false);
    });

    it('does not notify a content event outside the date settings but does baseline it', () => {
        const album = groupWithEditions('a', [
            edition('release-1', { date: '2024-05-01' }),
            edition('release-2', { date: '2024-05-20', trackCount: 18 }),
        ]);

        const changes = analyzeReleaseGroupChanges(
            known([['a', baselined('2026-05-01', 12)]]),
            [album],
            recentTwelveMonths,
            NOW,
        );

        assert.deepEqual(changes.newEvents, []);
        // Baselined so the same edition is not reconsidered on every scan.
        assert.equal(changes.groupState.get('a')?.maxOfficialTrackCount, 18);
        assert.equal(changes.groupState.get('a')?.lastNotifiedDate, '2026-05-01');
    });

    it('collapses multiple qualifying changes in one scan into one event per group', () => {
        const album = groupWithEditions('a', [
            edition('release-1'),
            edition('release-2', {
                date: '2026-05-20',
                trackCount: 20,
                title: 'Album (Deluxe)',
                editionKeywords: ['deluxe'],
            }),
        ]);

        const changes = analyzeReleaseGroupChanges(
            known([['a', baselined('2026-05-01', 12)]]),
            [album],
            twelveMonths,
            NOW,
        );

        assert.equal(changes.newEvents.length, 1);
        assert.equal(changes.newEvents[0]?.reason, 'more-tracks');
        assert.equal(changes.newEvents[0]?.trackCount, 20);
        assert.deepEqual(changes.groupState.get('a')?.editionKeywords, ['deluxe']);
    });

    it('chooses a recent keyword carrier over an ineligible larger track edition', () => {
        const album = groupWithEditions('a', [
            edition('old-large', { date: '2020-01-01', trackCount: 30 }),
            edition('recent-deluxe', {
                date: '2026-05-15',
                trackCount: 18,
                title: 'Album (Deluxe)',
                editionKeywords: ['deluxe'],
            }),
        ]);
        const stored = baselined('2020-01-01', 12, []);

        const first = analyzeReleaseGroupChanges(
            known([['a', stored]]),
            [album],
            twelveMonths,
            NOW,
        );
        const second = analyzeReleaseGroupChanges(
            known([['a', first.groupState.get('a')!]]),
            [album],
            twelveMonths,
            NOW,
        );

        assert.equal(first.newEvents.length, 1);
        assert.equal(first.newEvents[0]?.edition?.releaseId, 'recent-deluxe');
        assert.equal(first.newEvents[0]?.trackCount, 18);
        assert.equal(first.newEvents[0]?.date, '2026-05-15');
        assert.deepEqual(first.newEvents[0]?.editionKeywords, ['deluxe']);
        assert.deepEqual(second.newEvents, []);
    });

    it('does not let an ineligible undated maximum mask an eligible dated increase', () => {
        const album = groupWithEditions('a', [
            edition('undated-large', { date: null, trackCount: 30 }),
            edition('dated-recent', { date: '2026-05-15', trackCount: 18 }),
        ]);

        const changes = analyzeReleaseGroupChanges(
            known([['a', baselined('2020-01-01', 12)]]),
            [album],
            recentTwelveMonths,
            NOW,
        );

        assert.equal(changes.newEvents.length, 1);
        assert.equal(changes.newEvents[0]?.edition?.releaseId, 'dated-recent');
    });

    it('selects the newest eligible keyword carrier and ties keywords to it', () => {
        const album = groupWithEditions('a', [
            edition('older-remaster', {
                date: '2026-01-01',
                trackCount: 12,
                title: 'Album (Remastered)',
                editionKeywords: ['remaster'],
            }),
            edition('newer-deluxe', {
                date: '2026-05-15',
                trackCount: 12,
                title: 'Album (Deluxe)',
                editionKeywords: ['deluxe'],
            }),
        ]);

        const changes = analyzeReleaseGroupChanges(
            known([['a', baselined('2020-01-01', 12)]]),
            [album],
            twelveMonths,
            NOW,
        );

        assert.equal(changes.newEvents.length, 1);
        assert.equal(changes.newEvents[0]?.edition?.releaseId, 'newer-deluxe');
        assert.equal(changes.newEvents[0]?.reason, 'new-edition');
        assert.deepEqual(changes.newEvents[0]?.editionKeywords, ['deluxe']);
    });

    it('prunes a known group that left the catalog', () => {
        const changes = analyzeReleaseGroupChanges(
            known([
                ['gone', baselined('2026-01-01', 1)],
                ['here', baselined('2026-05-01', 1)],
            ]),
            [groupWithEditions('here', [edition('release-1')])],
            twelveMonths,
            NOW,
        );

        assert.deepEqual(changes.deletedGroupIds, ['gone']);
        assert.deepEqual(changes.prunedGroupIds, ['gone']);
        assert.equal(changes.groupState.has('gone'), false);
    });

    it('baselines a new group outside the date window without notifying', () => {
        const changes = analyzeReleaseGroupChanges(
            known([]),
            [groupWithEditions('old', [edition('old-release', { date: '2019-01-01' })])],
            recentTwelveMonths,
            NOW,
        );

        assert.deepEqual(changes.newEvents, []);
        // The group is known and content-baselined now, just not an event.
        assert.equal(changes.groupState.get('old')?.maxOfficialTrackCount, 12);
        assert.equal(changes.groupState.get('old')?.lastNotifiedDate, null);
    });

    it('honours includeReleasesWithoutDate for a new group', () => {
        const undated = groupWithEditions('nodate', [edition('r1', { date: null })]);
        const included = analyzeReleaseGroupChanges(known([]), [undated], twelveMonths, NOW);
        const excluded = analyzeReleaseGroupChanges(
            known([]),
            [undated],
            recentTwelveMonths,
            NOW,
        );

        assert.equal(included.newEvents.length, 1);
        assert.equal(excluded.newEvents.length, 0);
    });

    it('orders new events newest first', () => {
        const changes = analyzeReleaseGroupChanges(
            known([]),
            [
                groupWithEditions('old', [edition('r-old', { date: '2025-06-01' })]),
                groupWithEditions('new', [edition('r-new', { date: '2026-05-01' })]),
                groupWithEditions('mid', [edition('r-mid', { date: '2025-08-01' })]),
            ],
            twelveMonths,
            NOW,
        );

        assert.deepEqual(
            changes.newEvents.map((entry) => entry.group.id),
            ['new', 'mid', 'old'],
        );
    });

    it('does not prune or notify from an incomplete catalog', () => {
        const state = known([
            ['a', baselined('2026-01-01', 1)],
            ['b', baselined('2026-01-01', 1)],
        ]);
        const changes = analyzeReleaseGroupChanges(
            state,
            [groupWithEditions('a', [edition('r-a', { trackCount: 30 })])],
            twelveMonths,
            NOW,
            false,
        );

        assert.deepEqual(changes.prunedGroupIds, []);
        assert.deepEqual(changes.newEvents, []);
        assert.deepEqual(changes.groupState, state);
        assert.equal(changes.groupsChanged, false);
    });

    it('does not baseline an incomplete catalog', () => {
        const changes = analyzeReleaseGroupChanges(
            known([['a', emptyKnownReleaseGroupState('', false)]]),
            [groupWithEditions('a', [edition('r-a')])],
            twelveMonths,
            NOW,
            false,
        );

        assert.deepEqual(changes.baselinedGroupIds, []);
        assert.equal(changes.groupState.get('a')?.contentBaselined, false);
    });

    it('does not let future Official editions move the baseline', () => {
        const album = groupWithEditions('a', [
            edition('r-old', { date: '2026-01-01', trackCount: 12 }),
            edition('r-future', {
                date: '2026-07-01',
                trackCount: 30,
                title: 'Album (Deluxe)',
                editionKeywords: ['deluxe'],
            }),
        ]);

        const before = analyzeReleaseGroupChanges(
            known([['a', baselined('2026-01-01', 12)]]),
            [album],
            twelveMonths,
            NOW,
        );
        const after = analyzeReleaseGroupChanges(
            known([['a', baselined('2026-01-01', 12)]]),
            [album],
            twelveMonths,
            new Date('2026-07-02T00:00:00Z'),
        );

        assert.deepEqual(before.newEvents, []);
        assert.equal(before.groupState.get('a')?.maxOfficialTrackCount, 12);
        assert.equal(after.newEvents.length, 1);
        assert.equal(after.newEvents[0]?.reason, 'more-tracks');
    });

    it('never prunes from an empty catalog', () => {
        const changes = analyzeReleaseGroupChanges(
            known([
                ['a', baselined('2026-01-01', 1)],
                ['b', baselined('2026-01-01', 1)],
            ]),
            [],
            twelveMonths,
            NOW,
        );

        assert.deepEqual(changes.prunedGroupIds, []);
        assert.deepEqual(changes.newEvents, []);
        assert.equal(changes.groupsChanged, false);
        assert.deepEqual(
            Array.from(changes.groupState.keys()).sort(),
            ['a', 'b'],
        );
    });

    it('prunes groups absent from a populated catalog', () => {
        const changes = analyzeReleaseGroupChanges(
            known([
                ['a', baselined('2026-01-01', 1)],
                ['b', baselined('2026-01-01', 1)],
                ['c', baselined('2026-01-01', 1)],
            ]),
            [groupWithEditions('a', [edition('r-a')])],
            twelveMonths,
            NOW,
        );

        assert.deepEqual(changes.prunedGroupIds, ['b', 'c']);
        assert.equal(changes.groupState.has('a'), true);
    });
});

describe('planArtistScan', () => {
    const album = groupWithEditions('a', [
        edition('release-1'),
        edition('release-2'),
        edition('release-3', { date: '2026-05-01' }),
    ]);

    it('does not re-notify a group the user already knows', () => {
        const plan = planArtistScan(
            known([['a', emptyKnownReleaseGroupState('', false)]]),
            [album],
            twelveMonths,
            NOW,
        );

        assert.deepEqual(plan.newEvents, []);
        assert.deepEqual(plan.knownGroupIds, ['a']);
        assert.equal(plan.groupState.get('a')?.maxOfficialTrackCount, 12);
        assert.equal(plan.groupsChanged, true);
    });

    it('notifies a group whose pressings are all unknown', () => {
        const plan = planArtistScan(known([]), [album], twelveMonths, NOW);

        assert.deepEqual(
            plan.newEvents.map((entry) => entry.group.id),
            ['a'],
        );
        assert.equal(plan.groupsChanged, true);
    });

    it('keeps known groups and drops pruned ones in one pass', () => {
        const plan = planArtistScan(
            known([
                ['a', emptyKnownReleaseGroupState('', false)],
                ['deleted-group', emptyKnownReleaseGroupState('', false)],
            ]),
            [album],
            twelveMonths,
            NOW,
        );

        assert.equal(plan.groupState.has('a'), true);
        assert.deepEqual(plan.prunedGroupIds, ['deleted-group']);
    });

    it('is idempotent: a second scan plans nothing', () => {
        const first = planArtistScan(
            known([['a', emptyKnownReleaseGroupState('', false)]]),
            [album],
            twelveMonths,
            NOW,
        );
        const second = planArtistScan(first.groupState, [album], twelveMonths, NOW);

        assert.deepEqual(second.newEvents, []);
        assert.equal(second.groupsChanged, false);
    });

});