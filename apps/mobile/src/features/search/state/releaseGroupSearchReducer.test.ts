import { describe, expect, it } from 'vitest';
import type { ReleaseGroupSearchResultItem } from '../../../types/apiTypes';
import {
    createInitialReleaseGroupSearchState,
    releaseGroupSearchReducer,
} from './releaseGroupSearchReducer';

function releaseGroup(id: string, title = id): ReleaseGroupSearchResultItem {
    return {
        id,
        title,
        'primary-type': 'Album',
        'first-release-date': '2025-01-01',
        'artist-credit': [],
    };
}

describe('releaseGroupSearchReducer', () => {
    describe('initial state', () => {
        it('creates valid initial state', () => {
            const state = createInitialReleaseGroupSearchState();
            expect(state.releaseGroups).toEqual([]);
            expect(state.releaseGroupCovers).toEqual({});
            expect(state.pendingCoverIds).toEqual([]);
            expect(state.isLoading).toBe(false);
            expect(state.offset).toBe(0);
            expect(state.submittedQuery).toBe('');
        });
    });

    describe('queryChanged', () => {
        const searched = () => ({
            ...createInitialReleaseGroupSearchState(),
            submittedQuery: 'ok computer',
            releaseGroups: [releaseGroup('group-1')],
            releaseGroupCovers: { 'group-1': 'https://cover.example/one.jpg' },
            pendingCoverIds: ['group-2'],
            offset: 10,
            allResultsFetched: true,
        });

        it('drops results once the typed query diverges from the submitted one', () => {
            const state = releaseGroupSearchReducer(searched(), {
                type: 'queryChanged',
                query: 'kid a',
            });

            expect(state.releaseGroups).toEqual([]);
            expect(state.releaseGroupCovers).toEqual({});
            expect(state.pendingCoverIds).toEqual([]);
            expect(state.offset).toBe(0);
            expect(state.allResultsFetched).toBe(false);
            // The previous search's query is kept so it is still known.
            expect(state.submittedQuery).toBe('ok computer');
        });

        it('drops results when the query is cleared', () => {
            const state = releaseGroupSearchReducer(searched(), {
                type: 'queryChanged',
                query: '',
            });

            expect(state.releaseGroups).toEqual([]);
        });

        it('keeps results while the typed query still matches the submitted one', () => {
            const state = releaseGroupSearchReducer(searched(), {
                type: 'queryChanged',
                query: 'ok computer ',
            });

            expect(state.releaseGroups).toHaveLength(1);
            expect(state.releaseGroupCovers).toEqual({
                'group-1': 'https://cover.example/one.jpg',
            });
            expect(state.offset).toBe(10);
            expect(state.allResultsFetched).toBe(true);
        });

        it('keeps results when the submitted query is re-typed', () => {
            const state = releaseGroupSearchReducer(searched(), {
                type: 'queryChanged',
                query: 'ok computer',
            });

            expect(state.releaseGroups).toHaveLength(1);
        });
    });

    describe('searchStarted', () => {
        it('clears prior results and covers for a new search', () => {
            const state = releaseGroupSearchReducer(
                {
                    ...createInitialReleaseGroupSearchState(),
                    submittedQuery: 'old',
                    releaseGroups: [releaseGroup('old-group')],
                    releaseGroupCovers: { 'old-group': 'https://cover.example/old.jpg' },
                    pendingCoverIds: ['old-group'],
                    offset: 10,
                    allResultsFetched: true,
                },
                { type: 'searchStarted', query: 'new' },
            );

            expect(state.isLoading).toBe(true);
            expect(state.submittedQuery).toBe('new');
            expect(state.releaseGroups).toEqual([]);
            expect(state.releaseGroupCovers).toEqual({});
            expect(state.pendingCoverIds).toEqual([]);
            expect(state.offset).toBe(0);
            expect(state.allResultsFetched).toBe(false);
        });
    });

    describe('searchSucceeded', () => {
        it('replaces results and tracks pending covers for a fresh search', () => {
            const state = releaseGroupSearchReducer(
                { ...createInitialReleaseGroupSearchState(), isLoading: true },
                {
                    type: 'searchSucceeded',
                    releaseGroups: [releaseGroup('group-1')],
                    releaseGroupCovers: { 'group-1': 'https://cover.example/one.jpg' },
                    pendingCoverIds: ['group-2'],
                    nextOffset: 10,
                    allResultsFetched: false,
                    isAppending: false,
                },
            );

            expect(state.isLoading).toBe(false);
            expect(state.releaseGroups).toHaveLength(1);
            expect(state.pendingCoverIds).toEqual(['group-2']);
            expect(state.offset).toBe(10);
        });

        it('appends results and pending covers when loading more', () => {
            const state = releaseGroupSearchReducer(
                {
                    ...createInitialReleaseGroupSearchState(),
                    releaseGroups: [releaseGroup('group-1')],
                    pendingCoverIds: ['group-1'],
                    offset: 10,
                },
                {
                    type: 'searchSucceeded',
                    releaseGroups: [releaseGroup('group-2')],
                    releaseGroupCovers: {},
                    pendingCoverIds: ['group-2'],
                    nextOffset: 20,
                    allResultsFetched: true,
                    isAppending: true,
                },
            );

            expect(state.releaseGroups.map((group) => group.id)).toEqual(['group-1', 'group-2']);
            expect(state.pendingCoverIds).toEqual(['group-1', 'group-2']);
            expect(state.offset).toBe(20);
        });
    });

    describe('coversResolved', () => {
        it('merges covers and clears them from the pending list', () => {
            const state = releaseGroupSearchReducer(
                {
                    ...createInitialReleaseGroupSearchState(),
                    releaseGroups: [releaseGroup('group-1'), releaseGroup('group-2')],
                    pendingCoverIds: ['group-1', 'group-2'],
                },
                {
                    type: 'coversResolved',
                    releaseGroupCovers: { 'group-1': 'https://cover.example/one.jpg' },
                    resolvedIds: ['group-1'],
                },
            );

            expect(state.releaseGroupCovers).toEqual({
                'group-1': 'https://cover.example/one.jpg',
            });
            expect(state.pendingCoverIds).toEqual(['group-2']);
        });

        it('records a confirmed miss as null', () => {
            const state = releaseGroupSearchReducer(
                {
                    ...createInitialReleaseGroupSearchState(),
                    releaseGroups: [releaseGroup('group-1')],
                    pendingCoverIds: ['group-1'],
                },
                {
                    type: 'coversResolved',
                    releaseGroupCovers: { 'group-1': null },
                    resolvedIds: ['group-1'],
                },
            );

            expect(state.releaseGroupCovers).toEqual({ 'group-1': null });
            expect(state.pendingCoverIds).toEqual([]);
        });
    });

    describe('cleared', () => {
        it('returns to the initial state', () => {
            const state = releaseGroupSearchReducer(
                {
                    ...createInitialReleaseGroupSearchState(),
                    submittedQuery: 'ok computer',
                    releaseGroups: [releaseGroup('group-1')],
                },
                { type: 'cleared' },
            );

            expect(state).toEqual(createInitialReleaseGroupSearchState());
        });
    });
});
