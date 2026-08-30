/**
 * Pure threshold logic for maps doc size monitoring (no Firebase dependency).
 * Exported for unit testing.
 */
const WARN_THRESHOLD = 850 * 1024; // 850 KiB (~85% of 1 MiB)
const CRITICAL_THRESHOLD = 950 * 1024; // 950 KiB (~93% of 1 MiB)

export type SizeLevel = 'ok' | 'warn' | 'critical';

export const checkMapsDocSizeThresholds = (byteSize: number): SizeLevel => {
    if (byteSize > CRITICAL_THRESHOLD) return 'critical';
    if (byteSize > WARN_THRESHOLD) return 'warn';
    return 'ok';
};
