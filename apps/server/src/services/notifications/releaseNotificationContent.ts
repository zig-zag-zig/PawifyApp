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
        payload: {
            /** Newest release of the group: still drives the release screen. */
            releaseId: string;
            /** Present for clients that can open the whole group instead. */
            releaseGroupId?: string | null;
            /** 1 means `releaseId` is the only release, so a group screen would be empty. */
            releaseCount?: number;
        };
    };
};

/**
 * One notification per release group.
 *
 * Detection already returns one entry per group, and grouping again here keeps the
 * builder correct for callers that hand it release-level data (two entries can
 * still share a group id when several artists credit the same album).
 *
 * The payload keeps `releaseId` — that is what shipping clients read, so they keep
 * deep-linking to the release screen — and adds the group id and release count for
 * clients that can open the group instead. Extra fields are ignored by old builds.
 */
export const buildReleaseNotifications = (
    notificationsData: NewRelease[],
): BuiltReleaseNotification[] => {
    const releaseMap = new Map<
        string,
        {
            releaseId: string;
            releaseGroupId: string | null;
            releaseCount: number;
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

        const key = release.releaseGroupId ?? release.id;
        const existingEntry = releaseMap.get(key);
        if (existingEntry) {
            artistNames.forEach((name) => existingEntry.artistNames.add(name));
            existingEntry.releaseCount = Math.max(
                existingEntry.releaseCount,
                release.releaseCount ?? 1,
            );
        } else {
            releaseMap.set(key, {
                releaseId: release.id,
                releaseGroupId: release.releaseGroupId ?? null,
                releaseCount: release.releaseCount ?? 1,
                title: release.title,
                artistNames: new Set(artistNames),
                disambiguation: release.disambiguation,
                date_for_display: release.date_for_display,
            });
        }
    }

    return Array.from(releaseMap.values()).map(
        ({
            releaseId,
            releaseGroupId,
            releaseCount,
            title,
            disambiguation,
            artistNames,
            date_for_display,
        }) => ({
            body: `By ${Array.from(artistNames).join(', ')}\nReleased ${date_for_display}`,
            title: nameWithDisambiguation(disambiguation, title),
            data: {
                eventName: notificationEvents.releases,
                payload: {
                    releaseId,
                    releaseGroupId,
                    releaseCount,
                },
            },
        }),
    );
};

/**
 * One-line-per-release digest body for the notifications that overflowed the
 * per-release cap. Tapping it opens the Releases tab (no single release id), so
 * the user lands on the full list.
 */
export const buildDigestNotificationBody = (notifications: BuiltReleaseNotification[]): string => {
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

/**
 * Title for the notifications that overflowed the per-release cap. "more" is
 * deliberate: the user has already been pushed the first `maxIndividual`
 * releases, so a bare count reads as the total and understates what is new.
 * Only ever plural in practice (a lone overflow release is promoted to its own
 * notification in `splitReleaseNotifications`), but the singular branch keeps
 * the helper safe to call on its own.
 */
export const buildDigestNotificationTitle = (overflowCount: number): string =>
    `${overflowCount} more new release${overflowCount === 1 ? '' : 's'}`;

/**
 * Applies the per-release cap: the first `maxIndividual` notifications are sent
 * one-per-release, and everything past the cap is collapsed into a single
 * digest.
 *
 * A lone overflow release is promoted back to a per-release notification: a
 * "digest" of one only repeats the count, and a per-release push can deep-link
 * to that release while a digest can only open the Releases tab. So the digest
 * always carries two or more releases and a single extra release still opens
 * its own release page when tapped.
 */
export const splitReleaseNotifications = (
    notifications: BuiltReleaseNotification[],
    maxIndividual: number,
): { individual: BuiltReleaseNotification[]; digest: BuiltReleaseNotification[] } => {
    const cap = Math.max(0, Math.floor(maxIndividual));
    const individual = notifications.slice(0, cap);
    const overflow = notifications.slice(cap);

    if (overflow.length === 1) {
        return { individual: [...individual, ...overflow], digest: [] };
    }

    return { individual, digest: overflow };
};
