import { describe, expect, it } from 'vitest';
import { artistsReducer, createInitialArtistsState } from './artistsReducer';

describe('artistsReducer', () => {
    it('has correct initial state', () => {
        const state = createInitialArtistsState();
        expect(state).toEqual({ artists: [], isLoading: true });
    });

    it('handles artistsLoaded', () => {
        const artists = [{ id: '1', name: 'Artist 1' }, { id: '2', name: 'Artist 2' }];
        const state = artistsReducer(createInitialArtistsState(), { type: 'artistsLoaded', artists });
        expect(state.artists).toBe(artists);
    });

    it('handles loadingChanged', () => {
        const state = artistsReducer(createInitialArtistsState(), { type: 'loadingChanged', isLoading: false });
        expect(state.isLoading).toBe(false);
    });

    it('returns current state for unknown action', () => {
        const current = createInitialArtistsState();
        const state = artistsReducer(current, { type: 'unknown' } as any);
        expect(state).toBe(current);
    });
});
