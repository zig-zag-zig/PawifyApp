export const parsePositiveIntEnv = (value: string | undefined, fallback: number): number => {
    const parsed = Number.parseInt(value ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const parseBooleanEnv = (value: string | undefined, fallback = false): boolean => {
    if (!value) {
        return fallback;
    }

    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes'].includes(normalized)) {
        return true;
    }
    if (['false', '0', 'no'].includes(normalized)) {
        return false;
    }

    return fallback;
};

export const parseFloatEnv = (
    value: string | undefined,
    fallback: number,
    min = 0,
    max = 1,
): number => {
    const parsed = Number.parseFloat(value ?? '');
    return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
};
