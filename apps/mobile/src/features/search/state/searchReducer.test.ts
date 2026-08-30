import { describe, expect, it } from 'vitest';
import type { Artist } from '../../../shared/music';
import { createInitialSearchState, searchReducer } from './searchReducer';

function artist(id: string, name = id): Artist {
  return {
    id,
    name,
    type: 'Person',
    disambiguation: null,
    aliases: [],
    members: [],
    externalLinks: [],
    lifeSpan: { begin: null, end: null, ended: false },
    beginArea: { name: null },
  };
}

describe('searchReducer', () => {
  describe('initial state', () => {
    it('creates valid initial state', () => {
      const state = createInitialSearchState();
      expect(state.query).toBe('');
      expect(state.submittedQuery).toBe('');
      expect(state.artists).toEqual([]);
      expect(state.isLoading).toBe(false);
      expect(state.offset).toBe(0);
      expect(state.pendingTaskId).toBeNull();
      expect(state.shouldPreserveState).toBe(false);
      expect(state.allResultsFetched).toBe(false);
    });
  });

  describe('queryChanged', () => {
    it('updates query and resets preserveState', () => {
      const state = searchReducer(
        { ...createInitialSearchState(), shouldPreserveState: true },
        { type: 'queryChanged', query: 'new query' },
      );
      expect(state.query).toBe('new query');
      expect(state.shouldPreserveState).toBe(false);
    });
  });

  describe('searchStarted', () => {
    it('resets results and offset for new search', () => {
      const initialState = {
        ...createInitialSearchState(),
        artists: [artist('old')],
        offset: 10,
        allResultsFetched: true,
      };

      const state = searchReducer(initialState, {
        type: 'searchStarted',
        isAppending: false,
        query: 'twice',
      });

      expect(state.isLoading).toBe(true);
      expect(state.isAppending).toBe(false);
      expect(state.submittedQuery).toBe('twice');
      expect(state.artists).toEqual([]);
      expect(state.offset).toBe(0);
      expect(state.allResultsFetched).toBe(false);
    });

    it('preserves results and offset for append search', () => {
      const existing = [artist('a')];
      const initialState = { ...createInitialSearchState(), artists: existing, offset: 10 };

      const state = searchReducer(initialState, {
        type: 'searchStarted',
        isAppending: true,
        query: 'query',
      });

      expect(state.isLoading).toBe(true);
      expect(state.isAppending).toBe(true);
      expect(state.artists).toBe(existing);
      expect(state.offset).toBe(10);
    });
  });

  describe('searchTaskCreated', () => {
    it('stores pending task ID', () => {
      const state = searchReducer(createInitialSearchState(), {
        type: 'searchTaskCreated',
        taskId: 'task-1',
      });
      expect(state.pendingTaskId).toBe('task-1');
    });
  });

  describe('searchTaskCleared', () => {
    it('clears pending task ID', () => {
      const state = searchReducer(
        { ...createInitialSearchState(), pendingTaskId: 'task-1' },
        { type: 'searchTaskCleared' },
      );
      expect(state.pendingTaskId).toBeNull();
    });
  });

  describe('searchSucceeded', () => {
    it('replaces artists for fresh search', () => {
      const state = searchReducer(
        { ...createInitialSearchState(), artists: [artist('old')] },
        {
          type: 'searchSucceeded',
          artists: [artist('new')],
          nextOffset: 10,
          allResultsFetched: false,
          isAppending: false,
        },
      );

      expect(state.isLoading).toBe(false);
      expect(state.artists.map(a => a.id)).toEqual(['new']);
      expect(state.offset).toBe(10);
    });

    it('appends artists for paginated search', () => {
      const state = searchReducer(
        { ...createInitialSearchState(), artists: [artist('a')] },
        {
          type: 'searchSucceeded',
          artists: [artist('b')],
          nextOffset: 20,
          allResultsFetched: true,
          isAppending: true,
        },
      );

      expect(state.artists.map(a => a.id)).toEqual(['a', 'b']);
      expect(state.offset).toBe(20);
      expect(state.allResultsFetched).toBe(true);
    });
  });

  describe('searchFailed', () => {
    it('stops loading and clears append flag', () => {
      const state = searchReducer(
        { ...createInitialSearchState(), isLoading: true, isAppending: true },
        { type: 'searchFailed' },
      );
      expect(state.isLoading).toBe(false);
      expect(state.isAppending).toBe(false);
    });
  });

  describe('preserveStateChanged', () => {
    it('updates preserve flag', () => {
      const state = searchReducer(createInitialSearchState(), {
        type: 'preserveStateChanged',
        shouldPreserveState: true,
      });
      expect(state.shouldPreserveState).toBe(true);
    });
  });

  describe('resetForBlur', () => {
    it('preserves state on first blur, resets on second', () => {
      const populatedState = {
        ...createInitialSearchState(),
        query: 'boa',
        artists: [artist('boa')],
        shouldPreserveState: true,
      };

      const preservedState = searchReducer(populatedState, { type: 'resetForBlur' });
      const resetState = searchReducer(preservedState, { type: 'resetForBlur' });

      expect(preservedState.artists).toHaveLength(1);
      expect(preservedState.shouldPreserveState).toBe(false);
      expect(resetState).toEqual(createInitialSearchState());
    });

    it('fully resets when not preserving', () => {
      const state = searchReducer(
        { ...createInitialSearchState(), artists: [artist('a')], query: 'q' },
        { type: 'resetForBlur' },
      );
      expect(state).toEqual(createInitialSearchState());
    });
  });
});
