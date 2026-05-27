import { describe, expect, it } from 'vitest';
import { artistReducer, createInitialArtistPageState } from './artistReducer';

describe('artistReducer', () => {
  it('deduplicates queued image and cover work while preserving insertion order', () => {
    const initialState = createInitialArtistPageState();

    const withArtistImages = artistReducer(initialState, {
      type: 'artistImageLoadQueued',
      artistIds: ['artist-1', 'artist-2'],
    });
    const withMoreArtistImages = artistReducer(withArtistImages, {
      type: 'artistImageLoadQueued',
      artistIds: ['artist-2', 'artist-3'],
    });
    const withCovers = artistReducer(withMoreArtistImages, {
      type: 'releaseGroupCoverLoadQueued',
      releaseGroupIds: ['rg-1', 'rg-1', 'rg-2'],
    });

    expect(withMoreArtistImages.pendingArtistImageIds).toEqual([
      'artist-1',
      'artist-2',
      'artist-3',
    ]);
    expect(withCovers.pendingReleaseGroupCoverIds).toEqual(['rg-1', 'rg-2']);
  });

  it('removes only resolved pending work and keeps unrelated work queued', () => {
    const queuedState = {
      ...createInitialArtistPageState(),
      pendingArtistImageIds: ['artist-1', 'artist-2', 'artist-3'],
      pendingReleaseGroupCoverIds: ['rg-1', 'rg-2'],
    };

    const resolvedState = artistReducer(queuedState, {
      type: 'artistImageLoadFinished',
      artistIds: ['artist-2', 'missing'],
    });
    const coverResolvedState = artistReducer(resolvedState, {
      type: 'releaseGroupCoverLoadFinished',
      releaseGroupIds: ['rg-1'],
    });

    expect(resolvedState.pendingArtistImageIds).toEqual(['artist-1', 'artist-3']);
    expect(coverResolvedState.pendingReleaseGroupCoverIds).toEqual(['rg-2']);
  });
});
