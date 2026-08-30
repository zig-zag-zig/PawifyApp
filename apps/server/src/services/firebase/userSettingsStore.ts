import {
    DEFAULT_RELEASE_NOTIFICATION_SETTINGS,
    ReleaseNotificationSettings,
} from '@pawify/shared';
import { coerceReleaseNotificationLookbackMonths } from '../../utils/types/releaseNotificationSettings.js';
import { getUserRef } from './refs.js';
import { getDocumentRefAndSnapshot } from './userStore.js';
import { isPlainObject } from '../../common/utils/objectGuards.js';

const RELEASE_NOTIFICATION_SETTINGS_FIELD = 'releaseNotificationSettings';

const normalizeOldestReleaseDateMonths = (value: unknown): number | null => {
    const normalized = coerceReleaseNotificationLookbackMonths(value);
    return normalized === undefined
        ? DEFAULT_RELEASE_NOTIFICATION_SETTINGS.oldestReleaseDateMonths
        : normalized;
};

export const normalizeReleaseNotificationSettings = (
    value: unknown,
): ReleaseNotificationSettings => {
    if (!isPlainObject(value)) {
        return DEFAULT_RELEASE_NOTIFICATION_SETTINGS;
    }

    return {
        oldestReleaseDateMonths: normalizeOldestReleaseDateMonths(value.oldestReleaseDateMonths),
        includeReleasesWithoutDate:
            typeof value.includeReleasesWithoutDate === 'boolean'
                ? value.includeReleasesWithoutDate
                : DEFAULT_RELEASE_NOTIFICATION_SETTINGS.includeReleasesWithoutDate,
    };
};

export const getReleaseNotificationSettingsFromDb = async (
    userId: string,
): Promise<ReleaseNotificationSettings> => {
    const { snapShot } = await getDocumentRefAndSnapshot(userId);
    return normalizeReleaseNotificationSettings(snapShot[RELEASE_NOTIFICATION_SETTINGS_FIELD]);
};

export const saveReleaseNotificationSettingsToDb = async (
    userId: string,
    settings: ReleaseNotificationSettings,
): Promise<ReleaseNotificationSettings> => {
    const normalized = normalizeReleaseNotificationSettings(settings);

    await getUserRef(userId).set(
        {
            [RELEASE_NOTIFICATION_SETTINGS_FIELD]: {
                ...normalized,
                updatedAt: Date.now(),
            },
        },
        { merge: true },
    );

    return normalized;
};
