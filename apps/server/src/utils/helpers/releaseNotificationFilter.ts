import {
    DEFAULT_RELEASE_NOTIFICATION_SETTINGS,
    type Release,
    type ReleaseNotificationSettings,
} from '@pawify/shared';
import { dateToTimestamp } from '@pawify/shared';

const invalidReleaseDateTime = -8640000000000000;

const startOfToday = (now: Date): Date => {
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    return today;
};

const subtractMonths = (date: Date, months: number): Date => {
    const result = new Date(date);
    result.setMonth(result.getMonth() - months);
    return result;
};

export const releaseDateMatchesNotificationSettings = (
    date: string | null,
    settings: ReleaseNotificationSettings = DEFAULT_RELEASE_NOTIFICATION_SETTINGS,
    now = new Date(),
): boolean => {
    if (!date?.trim()) {
        return settings.includeReleasesWithoutDate;
    }

    const releaseTime = dateToTimestamp(date);
    if (releaseTime === invalidReleaseDateTime || Number.isNaN(releaseTime)) {
        return false;
    }

    const today = startOfToday(now);
    if (releaseTime > today.getTime()) {
        return false;
    }

    if (settings.oldestReleaseDateMonths === null) {
        return true;
    }

    const cutoff = subtractMonths(today, settings.oldestReleaseDateMonths);
    return releaseTime >= cutoff.getTime();
};

export const releaseMatchesNotificationSettings = (
    release: Pick<Release, 'date'>,
    settings: ReleaseNotificationSettings = DEFAULT_RELEASE_NOTIFICATION_SETTINGS,
    now = new Date(),
): boolean => releaseDateMatchesNotificationSettings(release.date, settings, now);
