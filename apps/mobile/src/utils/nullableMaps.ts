export type NullableStringMap = Record<string, string | null | undefined>;

export function getIdsMissingFromValues(ids: string[], values: NullableStringMap): string[] {
    return ids.filter(id => values[id] === undefined);
}

export function normalizeNullableStringMap(value: unknown): Record<string, string | null> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }

    const output: Record<string, string | null> = {};
    Object.entries(value).forEach(([key, entry]) => {
        if (typeof entry === 'string') {
            const trimmed = entry.trim();
            output[key] = trimmed.length > 0 ? trimmed : null;
        } else if (entry === null) {
            output[key] = null;
        }
    });

    return output;
}

export function fillMissingIdsWithNull(
    ids: string[],
    values: NullableStringMap
): NullableStringMap {
    const nextValues: NullableStringMap = { ...values };

    ids.forEach(id => {
        if (nextValues[id] === undefined) {
            nextValues[id] = null;
        }
    });

    return nextValues;
}

export function mergeNullableStringMaps(
    currentValues: NullableStringMap,
    incomingValues: NullableStringMap
): NullableStringMap {
    let nextValues: NullableStringMap | null = null;

    Object.entries(incomingValues).forEach(([id, value]) => {
        if (value === undefined) {
            return;
        }

        const currentValue = currentValues[id];

        if (value === null && currentValue !== undefined) {
            return;
        }

        if (currentValue === value) {
            return;
        }

        nextValues ??= { ...currentValues };
        nextValues[id] = value;
    });

    return nextValues ?? currentValues;
}
