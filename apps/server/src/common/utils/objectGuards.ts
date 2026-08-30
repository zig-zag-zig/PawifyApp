export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

export const isRemoteValueState = (value: unknown): value is string | null | undefined =>
    value === undefined || value === null || typeof value === 'string';
