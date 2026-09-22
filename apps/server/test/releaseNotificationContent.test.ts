import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NewRelease } from '@pawify/shared';

import {
    buildDigestNotificationBody,
    buildDigestNotificationTitle,
    buildReleaseNotifications,
    splitReleaseNotifications,
} from '../src/services/notifications/releaseNotificationContent.js';

const newRelease = (
    id: string,
    title: string,
    artists: { [artistId: string]: string } = { 'artist-1': 'Aurora Test Ensemble' },
    overrides: Partial<NewRelease> = {},
): NewRelease => ({
    id,
    title,
    date: '2025-04-18',
    disambiguation: null,
    artists,
    date_for_display: '18 April 2025',
    'primary-type': 'Album',
    ...overrides,
});

const releases = (count: number): NewRelease[] =>
    Array.from({ length: count }, (_, index) =>
        newRelease(`release-${index + 1}`, `Release ${index + 1}`),
    );

describe('buildReleaseNotifications', () => {
    it('returns no notifications for no releases', () => {
        assert.deepEqual(buildReleaseNotifications([]), []);
    });

    it('builds one notification per release with artist and release data', () => {
        const notifications = buildReleaseNotifications([
            newRelease('release-1', 'Midnight Signals'),
        ]);

        assert.equal(notifications.length, 1);
        assert.equal(notifications[0].title, 'Midnight Signals');
        assert.equal(
            notifications[0].body,
            'By Aurora Test Ensemble\nReleased 18 April 2025',
        );
        assert.deepEqual(notifications[0].data, {
            eventName: 'releases',
            payload: { releaseId: 'release-1' },
        });
    });

    it('merges duplicate release ids and unions their artist names', () => {
        const notifications = buildReleaseNotifications([
            newRelease('release-1', 'Midnight Signals', { 'artist-1': 'Aurora' }),
            newRelease('release-1', 'Midnight Signals', { 'artist-2': 'Nova' }),
        ]);

        assert.equal(notifications.length, 1);
        assert.equal(notifications[0].body, 'By Aurora, Nova\nReleased 18 April 2025');
    });

    it('falls back to Unknown Artist when a release has no credited artists', () => {
        const notifications = buildReleaseNotifications([
            newRelease('release-1', 'Midnight Signals', {}),
        ]);

        assert.equal(notifications[0].body, 'By Unknown Artist\nReleased 18 April 2025');
    });

    it('includes the disambiguation in the title when present', () => {
        const notifications = buildReleaseNotifications([
            newRelease('release-1', 'Midnight Signals', undefined, {
                disambiguation: 'UK edition',
            }),
        ]);

        assert.equal(notifications[0].title, 'Midnight Signals (UK edition)');
    });
});

describe('splitReleaseNotifications', () => {
    it('sends everything individually when under the cap', () => {
        const notifications = buildReleaseNotifications(releases(2));
        const { individual, digest } = splitReleaseNotifications(notifications, 3);

        assert.equal(individual.length, 2);
        assert.equal(digest.length, 0);
    });

    it('sends exactly the cap individually when the count matches it', () => {
        const notifications = buildReleaseNotifications(releases(3));
        const { individual, digest } = splitReleaseNotifications(notifications, 3);

        assert.equal(individual.length, 3);
        assert.equal(digest.length, 0);
    });

    it('promotes a lone overflow release instead of sending a digest of one', () => {
        const notifications = buildReleaseNotifications(releases(4));
        const { individual, digest } = splitReleaseNotifications(notifications, 3);

        assert.equal(digest.length, 0);
        assert.deepEqual(
            individual.map((notification) => notification.data.payload.releaseId),
            ['release-1', 'release-2', 'release-3', 'release-4'],
        );
    });

    it('collapses two or more overflow releases into a digest past the cap', () => {
        const notifications = buildReleaseNotifications(releases(5));
        const { individual, digest } = splitReleaseNotifications(notifications, 3);

        assert.equal(individual.length, 3);
        assert.deepEqual(
            digest.map((notification) => notification.data.payload.releaseId),
            ['release-4', 'release-5'],
        );
    });

    it('keeps the digest notifications in order after the cap', () => {
        const notifications = buildReleaseNotifications(releases(6));
        const { digest } = splitReleaseNotifications(notifications, 3);

        assert.deepEqual(
            digest.map((notification) => notification.data.payload.releaseId),
            ['release-4', 'release-5', 'release-6'],
        );
    });

    it('sends everything as a digest when the cap is zero', () => {
        const notifications = buildReleaseNotifications(releases(2));
        const { individual, digest } = splitReleaseNotifications(notifications, 0);

        assert.equal(individual.length, 0);
        assert.equal(digest.length, 2);
    });
});

describe('buildDigestNotificationBody', () => {
    it('renders one "Title — Artist" line per notification', () => {
        const notifications = buildReleaseNotifications([
            newRelease('release-1', 'Midnight Signals', { 'artist-1': 'Aurora' }),
            newRelease('release-2', 'Signal Drift', { 'artist-1': 'Nova' }),
        ]);

        assert.equal(
            buildDigestNotificationBody(notifications),
            'Midnight Signals — Aurora\nSignal Drift — Nova',
        );
    });

    it('strips the leading "By " from the artist line', () => {
        const notifications = buildReleaseNotifications([
            newRelease('release-1', 'Midnight Signals', { 'artist-1': 'Aurora' }),
        ]);

        const body = buildDigestNotificationBody(notifications);

        assert.equal(body, 'Midnight Signals — Aurora');
        assert.ok(!body.includes('By '));
    });

    it('joins multiple artists with the body separator intact', () => {
        const notifications = buildReleaseNotifications([
            newRelease('release-1', 'Midnight Signals', { 'a': 'Aurora', 'b': 'Nova' }),
        ]);

        assert.equal(buildDigestNotificationBody(notifications), 'Midnight Signals — Aurora, Nova');
    });

    it('truncates to ten lines and appends a remaining count', () => {
        const notifications = buildReleaseNotifications(releases(12));
        const lines = buildDigestNotificationBody(notifications).split('\n');

        assert.equal(lines.length, 11);
        assert.equal(lines[0], 'Release 1 — Aurora Test Ensemble');
        assert.equal(lines[9], 'Release 10 — Aurora Test Ensemble');
        assert.equal(lines[10], '+2 more');
    });

    it('does not append a remaining count at exactly ten entries', () => {
        const notifications = buildReleaseNotifications(releases(10));
        const lines = buildDigestNotificationBody(notifications).split('\n');

        assert.equal(lines.length, 10);
        assert.ok(!buildDigestNotificationBody(notifications).includes('more'));
    });
});

describe('buildDigestNotificationTitle', () => {
    it('counts the collapsed notifications with correct pluralization', () => {
        assert.equal(buildDigestNotificationTitle(1), '1 more new release');
        assert.equal(buildDigestNotificationTitle(2), '2 more new releases');
        assert.equal(buildDigestNotificationTitle(9), '9 more new releases');
    });
});
