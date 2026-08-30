export const RELEASE_NOTIFICATION_LOOKBACK_MONTH_OPTIONS = [1, 3, 6, 12, 24, 60] as const;
export const UNLIMITED_RELEASE_NOTIFICATION_LOOKBACK_MONTHS = 0;
export const MAX_RELEASE_NOTIFICATION_LOOKBACK_MONTHS =
    RELEASE_NOTIFICATION_LOOKBACK_MONTH_OPTIONS[
        RELEASE_NOTIFICATION_LOOKBACK_MONTH_OPTIONS.length - 1
    ];

const releaseNotificationLookbackMonthSet = new Set<number>(
    RELEASE_NOTIFICATION_LOOKBACK_MONTH_OPTIONS,
);

export const formatReleaseNotificationLookbackMonthOptions = (): string =>
    RELEASE_NOTIFICATION_LOOKBACK_MONTH_OPTIONS.join(', ');

export const coerceReleaseNotificationLookbackMonths = (
    value: unknown,
): number | null | undefined => {
    if (value === null || value === UNLIMITED_RELEASE_NOTIFICATION_LOOKBACK_MONTHS) {
        return null;
    }

    const parsed =
        typeof value === 'number'
            ? value
            : typeof value === 'string' && /^\d+$/.test(value.trim())
              ? Number.parseInt(value, 10)
              : Number.NaN;

    return Number.isInteger(parsed) && releaseNotificationLookbackMonthSet.has(parsed)
        ? parsed
        : undefined;
};
