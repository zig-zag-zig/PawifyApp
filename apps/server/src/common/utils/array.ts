export const chunkArray = <T>(items: T[], size: number): T[][] => {
    if (size < 1) {
        throw new RangeError('chunkArray size must be at least 1');
    }

    if (items.length === 0) {
        return [];
    }

    const chunked: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        chunked.push(items.slice(i, i + size));
    }

    return chunked;
};

export const dedupeStrings = (values: string[]): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const value of values) {
        const normalized = value.trim();
        if (!normalized || seen.has(normalized)) {
            continue;
        }

        seen.add(normalized);
        result.push(normalized);
    }

    return result;
};
