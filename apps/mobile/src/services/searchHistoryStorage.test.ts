import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    addSearchHistoryEntry,
    clearSearchHistory,
    loadSearchHistory,
    removeSearchHistoryEntry,
} from './searchHistoryStorage';

const storage = vi.hoisted(() => {
    let value: string | null = null;
    return {
        getItem: vi.fn(async () => value),
        setItem: vi.fn(async (_key: string, next: string) => { value = next; }),
        removeItem: vi.fn(async () => { value = null; }),
        reset: () => { value = null; },
    };
});

vi.mock('@react-native-async-storage/async-storage', () => ({ default: storage }));

afterEach(() => {
    storage.reset();
    vi.clearAllMocks();
});

describe('searchHistoryStorage', () => {
    it('deduplicates case-insensitively and keeps scopes separate', async () => {
        await addSearchHistoryEntry('Radiohead', 'artists');
        await addSearchHistoryEntry('radiohead', 'artists');
        await addSearchHistoryEntry('Radiohead', 'releases');

        expect(await loadSearchHistory()).toEqual([
            { query: 'Radiohead', scope: 'releases' },
            { query: 'radiohead', scope: 'artists' },
        ]);
    });

    it('limits history to the newest fifteen entries', async () => {
        for (let index = 0; index < 20; index += 1) {
            await addSearchHistoryEntry(`query-${index}`, 'artists');
        }

        const history = await loadSearchHistory();
        expect(history).toHaveLength(15);
        expect(history[0]?.query).toBe('query-19');
        expect(history.at(-1)?.query).toBe('query-5');
    });

    it('clears only the requested scope', async () => {
        await addSearchHistoryEntry('artist', 'artists');
        await addSearchHistoryEntry('album', 'releases');

        await clearSearchHistory('artists');

        expect(await loadSearchHistory()).toEqual([{ query: 'album', scope: 'releases' }]);
    });

    it('ignores malformed stored values', async () => {
        storage.getItem.mockResolvedValueOnce(JSON.stringify([
            { query: '', scope: 'artists' },
            { query: 'valid', scope: 'artists' },
            { query: 'bad-scope', scope: 'labels' },
            null,
        ]));

        expect(await loadSearchHistory()).toEqual([{ query: 'valid', scope: 'artists' }]);
    });

    describe('removeSearchHistoryEntry', () => {
        it('removes only the matching entry', async () => {
            await addSearchHistoryEntry('radiohead', 'artists');
            await addSearchHistoryEntry('nirvana', 'artists');
            await addSearchHistoryEntry('ok computer', 'releases');

            const remaining = await removeSearchHistoryEntry('radiohead', 'artists');

            expect(remaining).toEqual([
                { query: 'ok computer', scope: 'releases' },
                { query: 'nirvana', scope: 'artists' },
            ]);
            expect(await loadSearchHistory()).toEqual(remaining);
        });

        it('matches case-insensitively and trims the input', async () => {
            await addSearchHistoryEntry('Radiohead', 'artists');

            expect(await removeSearchHistoryEntry('  radiohead  ', 'artists')).toEqual([]);
        });

        it('leaves the same query in the other scope alone', async () => {
            await addSearchHistoryEntry('radiohead', 'artists');
            await addSearchHistoryEntry('radiohead', 'releases');

            expect(await removeSearchHistoryEntry('radiohead', 'artists')).toEqual([
                { query: 'radiohead', scope: 'releases' },
            ]);
        });

        it('is a no-op for an unknown entry', async () => {
            await addSearchHistoryEntry('radiohead', 'artists');

            expect(await removeSearchHistoryEntry('missing', 'artists')).toEqual([
                { query: 'radiohead', scope: 'artists' },
            ]);
        });
    });
});
