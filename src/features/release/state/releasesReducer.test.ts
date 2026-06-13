import { describe, expect, it } from 'vitest';
import { releasesReducer, createInitialReleasesState } from './releasesReducer';

describe('releasesReducer', () => {
    it('has correct initial state', () => {
        const state = createInitialReleasesState();
        expect(state).toEqual({ page: 0 });
    });

    it('handles pageIncreased', () => {
        const state = releasesReducer(createInitialReleasesState(), { type: 'pageIncreased' });
        expect(state.page).toBe(1);
    });

    it('increments page multiple times', () => {
        let state = createInitialReleasesState();
        state = releasesReducer(state, { type: 'pageIncreased' });
        state = releasesReducer(state, { type: 'pageIncreased' });
        expect(state.page).toBe(2);
    });

    it('handles pageReset', () => {
        const modified = { page: 5 };
        const state = releasesReducer(modified, { type: 'pageReset' });
        expect(state.page).toBe(0);
    });

    it('returns current state for unknown action', () => {
        const current = createInitialReleasesState();
        const state = releasesReducer(current, { type: 'unknown' } as any);
        expect(state).toBe(current);
    });
});
