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
  it('replaces results for a new search and appends only for paginated searches', () => {
    const initialState = {
      ...createInitialSearchState(),
      artists: [artist('old')],
      offset: 10,
      allResultsFetched: true,
    };

    const freshSearch = searchReducer(initialState, {
      type: 'searchStarted',
      isAppending: false,
      query: 'twice',
    });

    expect(freshSearch).toMatchObject({
      isLoading: true,
      isAppending: false,
      submittedQuery: 'twice',
      artists: [],
      offset: 0,
      allResultsFetched: false,
    });

    const firstPage = searchReducer(freshSearch, {
      type: 'searchSucceeded',
      artists: [artist('a')],
      nextOffset: 10,
      allResultsFetched: false,
      isAppending: false,
    });
    const appendedPage = searchReducer(firstPage, {
      type: 'searchSucceeded',
      artists: [artist('b')],
      nextOffset: 20,
      allResultsFetched: true,
      isAppending: true,
    });

    expect(appendedPage.artists.map(result => result.id)).toEqual(['a', 'b']);
    expect(appendedPage).toMatchObject({
      isLoading: false,
      isAppending: false,
      offset: 20,
      allResultsFetched: true,
    });
  });

  it('preserves state on blur once, then resets on a later blur', () => {
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
});
