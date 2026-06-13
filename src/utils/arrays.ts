export function mergeUniqueIds(existingIds: string[], incomingIds: string[]): string[] {
    if (incomingIds.length === 0) {
        return existingIds;
    }

    const merged = new Set(existingIds);
    incomingIds.forEach(id => merged.add(id));
    return [...merged];
}

export function removeIds(existingIds: string[], idsToRemove: string[]): string[] {
    if (existingIds.length === 0 || idsToRemove.length === 0) {
        return existingIds;
    }

    const idsToRemoveSet = new Set(idsToRemove);
    return existingIds.filter(id => !idsToRemoveSet.has(id));
}
