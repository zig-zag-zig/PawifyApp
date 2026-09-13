import { nameWithDisambiguation } from '@pawify/shared';
import type { NewRelease } from '@pawify/shared';
import { notificationEvents } from './notificationEvents.js';

/**
 * Pure content building for new-release notifications: the per-release
 * notifications, the per-release cap that decides which releases get their own
 * push, and the digest that collapses the overflow.
 *
 * Kept free of Firebase/MusicBrainz imports so the cap and digest behaviour can
 * be unit tested directly. Delivery and orchestration live in
 * newReleaseNotificationRunner.
 */

export type BuiltReleaseNotification = {
    body: string;
    title: string;
    data: {
        eventName: typeof notificationEvents.releases;
        payload: { releaseId: string };
    };
};

export const buildReleaseNotifications = (
    notificationsData: NewRelease[],
): BuiltReleaseNotification[] => {
    const releaseMap = new Map<
        string,
        {
            title: string;
            artistNames: Set<string>;
            disambiguation: string | null;
            date_for_display: string;
        }
    >();

    for (const release of notificationsData) {
        const artistNames = Object.values(release.artists)
            .map((name) => name.trim())
            .filter(Boolean);

        if (artistNames.length === 0) {
            artistNames.push('Unknown Artist');
        }

        if (releaseMap.has(release.id)) {
            const existingEntry = releaseMap.get(release.id)!;
            artistNames.forEach((name) => existingEntry.artistNames.add(name));
        } else {
            releaseMap.set(release.id, {
                title: release.title,
                artistNames: new Set(artistNames),
                disambiguation: release.disambiguation,
                date_for_display: release.date_for_display,
            });
        }
    }

    return Array.from(releaseMap.entries()).map(
        ([releaseId, { title, disambiguation, artistNames, date_for_display }]) => ({
            body: `By ${Array.from(artistNames).join(', ')}\nReleased ${date_for_display}`,
            title: nameWithDisambiguation(disambiguation, title),
            // Lets the app deep-link to this release's page when the
            // notification is tapped.
            data: {
                eventName: notificationEvents.releases,
                payload: { releaseId },
            },
        }),
    );
};

/**
 * One-line-per-release digest body for the notifications that overflowed the
 * per-release cap. Tapping it opens the Releases tab (no single release id), so
 * the user lands on the full list.
 */
export const buildDigestNotificationBody = (
    notifications: BuiltReleaseNotification[],
): string => {
    const digestLines = notifications.map((notification) => {
        const artistLine = notification.body.split('\n')[0]?.trim();
        return artistLine
            ? `${notification.title} — ${artistLine.replace(/^By\s+/i, '')}`
            : notification.title;
    });
    const shownTitles = digestLines.slice(0, 10);
    const remaining = digestLines.length - shownTitles.length;

    return remaining > 0
        ? [...shownTitles, `+${remaining} more`].join('\n')
        : shownTitles.join('\n');
};

export const buildDigestNotificationTitle = (overflowCount: number): string =>
    `${overflowCount} more new releases from your artists`;

/**
 * Applies the per-release cap: the first `maxIndividual` notifications are sent
 * one-per-release, and everything past the cap is collapsed into a single
 * digest.
 */
export const splitReleaseNotifications = (
    notifications: BuiltReleaseNotification[],
    maxIndividual: number,
): { individual: BuiltReleaseNotification[]; digest: BuiltReleaseNotification[] } => {
    const cap = Math.max(0, Math.floor(maxIndividual));

    return {
        individual: notifications.slice(0, cap),
        digest: notifications.slice(cap),
    };
};
