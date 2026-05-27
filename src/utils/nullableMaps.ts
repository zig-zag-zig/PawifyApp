export type NullableStringMap = Record<string, string | null | undefined>;

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
