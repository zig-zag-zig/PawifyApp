import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'pawify.searchHistory.v1';
const MAX_ENTRIES = 15;

export type SearchScope = 'artists' | 'releases';

export interface SearchHistoryEntry {
    query: string;
    scope: SearchScope;
}

const normalizeEntries = (value: unknown): SearchHistoryEntry[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.flatMap((entry) => {
        if (
            entry === null ||
            typeof entry !== 'object' ||
            typeof (entry as SearchHistoryEntry).query !== 'string' ||
            (entry as SearchHistoryEntry).query.trim().length === 0 ||
            ((entry as SearchHistoryEntry).scope !== 'artists' &&
                (entry as SearchHistoryEntry).scope !== 'releases')
        ) {
            return [];
        }

        return [{ query: (entry as SearchHistoryEntry).query.trim(), scope: (entry as SearchHistoryEntry).scope }];
    });
};

export const loadSearchHistory = async (): Promise<SearchHistoryEntry[]> => {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        return raw ? normalizeEntries(JSON.parse(raw)) : [];
    } catch (error) {
        console.warn('search-history: failed to load', error);
        return [];
    }
};

export const addSearchHistoryEntry = async (
    query: string,
    scope: SearchScope,
): Promise<SearchHistoryEntry[]> => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
        return loadSearchHistory();
    }

    const existing = await loadSearchHistory();
    const next = [
        { query: trimmedQuery, scope },
        ...existing.filter(
            (entry) =>
                !(
                    entry.scope === scope &&
                    entry.query.toLowerCase() === trimmedQuery.toLowerCase()
                ),
        ),
    ].slice(0, MAX_ENTRIES);

    try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
        console.warn('search-history: failed to save', error);
    }

    return next;
};

export const clearSearchHistory = async (scope?: SearchScope): Promise<void> => {
    try {
        if (!scope) {
            await AsyncStorage.removeItem(STORAGE_KEY);
            return;
        }

        const remaining = (await loadSearchHistory()).filter(
            (entry) => entry.scope !== scope,
        );
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
    } catch (error) {
        console.warn('search-history: failed to clear', error);
    }
};

/**
 * Removes a single entry, matching the same case-insensitive rule the add path
 * dedupes with. Returns the remaining entries.
 */
export const removeSearchHistoryEntry = async (
    query: string,
    scope: SearchScope,
): Promise<SearchHistoryEntry[]> => {
    const existing = await loadSearchHistory();
    const normalizedQuery = query.trim().toLowerCase();
    const remaining = existing.filter(
        (entry) =>
            !(entry.scope === scope && entry.query.toLowerCase() === normalizedQuery),
    );

    if (remaining.length === existing.length) {
        return existing;
    }

    try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
    } catch (error) {
        console.warn('search-history: failed to remove entry', error);
    }

    return remaining;
};
