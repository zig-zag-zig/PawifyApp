// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createInitialUnifiedSearchState } from '../model/unifiedTypes';
import { unifiedSearchReducer } from '../state/unifiedSearchReducer';
import { useUnifiedSearch } from './useUnifiedSearch';

const searchAllMock = vi.fn();
const waitForTaskResultById = vi.fn(async () => ({ status: 'pending' as const }));

vi.mock('@react-navigation/native', () => ({
    useNavigation: () => ({ navigate: vi.fn() }),
}));

vi.mock('../../../contexts/CacheContext', () => ({
    useCache: () => ({
        artistProfileImages: {},
        setArtistProfileImages: vi.fn(),
        releaseGroupCovers: {},
        setReleaseGroupCovers: vi.fn(),
    }),
}));

vi.mock('../../../hooks/useTaskManager', () => ({
    default: () => ({
        // Passthrough task store: run the closure and hand back its value, which is
        // all the paging logic depends on. The real store's replay/dedupe behaviour
        // has its own tests.
        addTask: (run: () => Promise<unknown>) => ({ id: 'task', run }),
        executeTask: async (task: { run: () => Promise<unknown> }) => await task.run(),
    }),
}));

vi.mock('../api/searchApi', () => ({
    useSearchApi: () => ({ searchAll: searchAllMock, waitForTaskResultById }),
}));

vi.mock('../../../services/searchHistoryStorage', () => ({
    addSearchHistoryEntry: vi.fn(async () => {}),
}));


const TOTAL_ARTISTS = 296;
const TOTAL_GROUPS = 240;
const TOTAL_TRACKS = 250;

type Kind = 'artists' | 'releaseGroups' | 'tracks';

const page = (prefix: string, total: number, offset: number, limit: number) =>
    Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, index) => {
        const position = offset + index;
        return `${prefix}-${position}`;
    });

/**
 * Mirrors `POST /searchAll?category=…`: only the requested category carries rows and
 * a count, the others resolve to empty results. Anything the client merges from a
 * different category would be a bug the real server can never mask.
 */
const serverPage = (kind: Kind, offset: number, limit: number) => ({
    artists:
        kind === 'artists'
            ? page('artist', TOTAL_ARTISTS, offset, limit).map((id) => ({ id, name: id }))
            : [],
    artistCount: kind === 'artists' ? TOTAL_ARTISTS : 0,
    artistProfileImages: {},
    artistProfileImageTaskId: null,
    releaseGroups:
        kind === 'releaseGroups'
            ? page('group', TOTAL_GROUPS, offset, limit).map((id) => ({
                  id,
                  title: id,
                  'primary-type': null,
                  'first-release-date': null,
                  'artist-credit': [],
              }))
            : [],
    releaseGroupCount: kind === 'releaseGroups' ? TOTAL_GROUPS : 0,
    releaseGroupCovers: {},
    releaseGroupCoverTaskId: null,
    recordings:
        kind === 'tracks'
            ? page('track', TOTAL_TRACKS, offset, limit).map((id) => ({
                  id,
                  title: id,
                  'artist-credit': [],
                  release: { id: `release-${id}`, title: id, releaseGroupId: null, date: null },
              }))
            : [],
    recordingCount: kind === 'tracks' ? TOTAL_TRACKS : 0,
    releaseCovers: {},
    releaseCoverTaskId: null,
});

const artist = (id: string) => ({ id, name: id });
const group = (id: string) => ({
    id,
    title: id,
    'primary-type': null,
    'first-release-date': null,
    'artist-credit': [],
});

const response = (artistCount: number, groupCount: number, trackCount = 0, prefix = 'a') => ({
    artists: Array.from({ length: artistCount }, (_, index) => artist(`${prefix}${index}`)),
    artistCount: 500,
    artistProfileImages: {},
    artistProfileImageTaskId: null,
    releaseGroups: Array.from({ length: groupCount }, (_, index) => group(`${prefix}g${index}`)),
    releaseGroupCount: 500,
    releaseGroupCovers: {},
    releaseGroupCoverTaskId: null,
    recordings: [],
    recordingCount: trackCount,
    releaseCovers: {},
    releaseCoverTaskId: null,
}) as never;

const searched = (kind: 'initial' | 'artists', payload = response(100, 100)) =>
    unifiedSearchReducer(
        { ...createInitialUnifiedSearchState(), query: 'love', submittedQuery: 'love' },
        { type: 'succeeded', result: payload, kind, offset: 0 },
    );

describe('unified search paging', () => {
    it('reveals only the first local page even though the server returned a full page', () => {
        const state = searched('initial');

        expect(state.artists).toHaveLength(100);
        expect(state.artistVisible).toBe(10);
        expect(state.releaseGroupVisible).toBe(10);
        // A full server page means the server may have more.
        expect(state.artistsAllFetched).toBe(false);
    });

    it('advances the reveal cursor without touching the fetched rows', () => {
        let state = searched('initial');
        state = unifiedSearchReducer(state, { type: 'revealed', kind: 'artists', count: 10 });

        expect(state.artistVisible).toBe(20);
        expect(state.artists).toHaveLength(100);
        // Revealing artists must not reveal releases.
        expect(state.releaseGroupVisible).toBe(10);
    });

    it('never reveals past the rows actually fetched', () => {
        let state = searched('artists', response(3, 0));
        state = unifiedSearchReducer(state, { type: 'revealed', kind: 'artists', count: 10 });

        expect(state.artistVisible).toBe(3);
    });

    it('appends a fetched server page and keeps the new rows hidden until revealed', () => {
        let state = searched('initial');
        state = unifiedSearchReducer(state, {
            type: 'succeeded',
            // A real second page has distinct ids; repeating them would just dedupe.
            result: response(100, 0, 0, 'b'),
            kind: 'artists',
            offset: 100,
        });

        expect(state.artists).toHaveLength(200);
        expect(state.artistVisible).toBe(20); // one more local page revealed on tap
        expect(state.artistOffset).toBe(200);
    });

    it('treats a short server page as exhausted', () => {
        const state = searched('artists', response(42, 0));

        expect(state.artistsAllFetched).toBe(true);
    });

    it('progressively resolves categories independently and keeps loading flags accurate', () => {
        let state = unifiedSearchReducer(createInitialUnifiedSearchState(), {
            type: 'started',
            query: 'radiohead',
            kind: 'initial',
            offset: 0,
        });

        expect(state.isLoading).toBe(true);
        expect(state.isLoadingArtists).toBe(true);
        expect(state.isLoadingReleaseGroups).toBe(true);
        expect(state.isLoadingTracks).toBe(true);
        expect(state.firstLoadedScope).toBeNull();

        // Artists arrives first with 0 hits; firstLoadedScope stays null and other tabs stay loading.
        state = unifiedSearchReducer(state, {
            type: 'succeeded',
            result: response(0, 0, 0),
            kind: 'artists',
            offset: 0,
        });

        expect(state.isLoadingArtists).toBe(false);
        expect(state.isLoadingReleaseGroups).toBe(true);
        expect(state.isLoadingTracks).toBe(true);
        expect(state.isLoading).toBe(true);
        expect(state.firstLoadedScope).toBeNull();

        // Release groups arrives next with hits -> becomes firstLoadedScope ('releases').
        state = unifiedSearchReducer(state, {
            type: 'succeeded',
            result: response(0, 15, 0),
            kind: 'releaseGroups',
            offset: 0,
        });

        expect(state.isLoadingReleaseGroups).toBe(false);
        expect(state.isLoadingTracks).toBe(true);
        expect(state.isLoading).toBe(true);
        expect(state.firstLoadedScope).toBe('releases');

        // Tracks arrives last -> does not overwrite firstLoadedScope, clears overall loading.
        state = unifiedSearchReducer(state, {
            type: 'succeeded',
            result: response(0, 0, 20),
            kind: 'tracks',
            offset: 0,
        });

        expect(state.isLoadingTracks).toBe(false);
        expect(state.isLoading).toBe(false);
        expect(state.firstLoadedScope).toBe('releases');
    });

    it('respects artists -> releases -> tracks priority when all arrive together', () => {
        const state = searched('initial', response(10, 10, 10));
        expect(state.firstLoadedScope).toBe('artists');
    });
});

describe('useUnifiedSearch load more', () => {
    beforeEach(() => {
        searchAllMock.mockReset();
        searchAllMock.mockImplementation(
            async (
                _query: string,
                limit: number,
                offset: number,
                kind: Kind,
            ) => serverPage(kind, offset, limit),
        );
    });

    it('never re-requests an offset, so every category keeps loading', async () => {
        const { result } = renderHook(() => useUnifiedSearch());

        await act(async () => {
            await result.current.onSubmitSearch('beatles');
        });
        expect(result.current.state.artists).toHaveLength(100);
        expect(result.current.state.artistVisible).toBe(10);

        // Keep tapping until the list is fully revealed.
        for (let tap = 0; tap < 80 && result.current.state.artistVisible < TOTAL_ARTISTS; tap += 1) {
            await act(async () => {
                await result.current.onLoadMoreArtists();
            });
        }

        expect(result.current.state.artists).toHaveLength(TOTAL_ARTISTS);
        expect(result.current.state.artistVisible).toBe(TOTAL_ARTISTS);
        expect(result.current.state.artistsAllFetched).toBe(true);

        // The origin/main regression: the offset was reset to the page length after
        // every load more, so the second tap re-fetched page 2 and appended nothing.
        const artistOffsets = searchAllMock.mock.calls
            .filter((call) => call[3] === 'artists')
            .map((call) => call[2] as number);
        expect(artistOffsets).toEqual([0, 100, 200]);
        expect(new Set(artistOffsets).size).toBe(artistOffsets.length);
    });

    it('stops asking for pages once a category is exhausted', async () => {
        const { result } = renderHook(() => useUnifiedSearch());

        await act(async () => {
            await result.current.onSubmitSearch('beatles');
        });

        for (let tap = 0; tap < 80; tap += 1) {
            await act(async () => {
                await result.current.onLoadMoreArtists();
            });
        }

        const callsAfterExhaustion = searchAllMock.mock.calls.length;
        for (let tap = 0; tap < 5; tap += 1) {
            await act(async () => {
                await result.current.onLoadMoreArtists();
            });
        }

        expect(searchAllMock.mock.calls.length).toBe(callsAfterExhaustion);
        expect(
            searchAllMock.mock.calls
                .filter((call) => call[3] === 'artists')
                .every((call) => (call[2] as number) <= 200),
        ).toBe(true);
    });

    it('pages release groups and tracks independently', async () => {
        const { result } = renderHook(() => useUnifiedSearch());

        await act(async () => {
            await result.current.onSubmitSearch('beatles');
        });

        for (let tap = 0; tap < 60; tap += 1) {
            await act(async () => {
                await result.current.onLoadMoreReleaseGroups();
            });
        }
        for (let tap = 0; tap < 60; tap += 1) {
            await act(async () => {
                await result.current.onLoadMoreTracks();
            });
        }

        expect(result.current.state.releaseGroups).toHaveLength(TOTAL_GROUPS);
        expect(result.current.state.releaseGroupVisible).toBe(TOTAL_GROUPS);
        expect(result.current.state.releaseGroupsAllFetched).toBe(true);

        expect(result.current.state.tracks).toHaveLength(TOTAL_TRACKS);
        expect(result.current.state.trackVisible).toBe(TOTAL_TRACKS);
        expect(result.current.state.tracksAllFetched).toBe(true);

        const offsetsFor = (kind: Kind) =>
            searchAllMock.mock.calls.filter((call) => call[3] === kind).map((call) => call[2]);
        expect(offsetsFor('releaseGroups')).toEqual([0, 100, 200]);
        expect(offsetsFor('tracks')).toEqual([0, 100, 200]);
    });
});
