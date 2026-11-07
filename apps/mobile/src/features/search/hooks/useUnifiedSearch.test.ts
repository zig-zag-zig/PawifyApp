import { describe, expect, it } from 'vitest';

import { createInitialUnifiedSearchState } from '../model/unifiedTypes';
import { unifiedSearchReducer } from '../state/unifiedSearchReducer';

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
