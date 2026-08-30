export const DEFAULT_FOREGROUND_REFRESH_MIN_INACTIVE_MS = 5 * 60 * 1000;

export function shouldRunForegroundRefresh(
    inactiveMs: number | null,
    minInactiveMs: number = DEFAULT_FOREGROUND_REFRESH_MIN_INACTIVE_MS,
): boolean {
    return inactiveMs === null || inactiveMs >= minInactiveMs;
}
