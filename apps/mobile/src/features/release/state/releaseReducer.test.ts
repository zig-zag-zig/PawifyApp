import { describe, expect, it } from 'vitest';
import { createInitialReleaseState, releaseReducer } from './releaseReducer';
import type { Release, Track } from '@pawify/shared';

const track = (id: string): Track => ({
  id,
  title: id,
  'artist-credit': [],
  length: null,
});

const release = (id = 'release-1'): Release => ({
  id,
  title: 'Midnight Signals',
  date: '2025-04-18',
  disambiguation: null,
  artistId: 'artist-1',
  date_for_display: '18.04.2025',
  'release-group': {
    id: 'release-group-1',
    title: 'Midnight Signals',
    date: '2025-04-18',
    disambiguation: null,
    'primary-type': 'Album',
  },
  'artist-credit': [],
  media: [
    {
      'track-count': 2,
      tracks: [track('track-1'), track('track-2')],
    },
  ],
  releaseGroupId: 'release-group-1',
  cover_url: null,
  externalLinks: [],
});

const loaded = (selectedSong: Track | null = null) => ({
  ...releaseReducer(createInitialReleaseState(), {
    type: 'releaseLoaded' as const,
    release: release(),
    trackLyrics: { 'track-1': undefined, 'track-2': null },
    artistProfileImages: { 'artist-1': undefined },
    pendingLyricTrackIds: ['track-1'],
    pendingArtistImageIds: ['artist-1'],
  }),
  selectedSong,
});

describe('releaseReducer', () => {
  it('creates initial state without track-loading phases', () => {
    const state = createInitialReleaseState();
    expect(state.release).toBeNull();
    expect(state.loadingLyrics).toBe(false);
    expect(state.checkingExistence).toBe(true);
    expect('loadingTracks' in state).toBe(false);
  });

  it('loads a release and tracklist in one action', () => {
    const state = loaded();
    expect(state.release?.media).toHaveLength(1);
    expect(state.releaseExists).toBe(true);
    expect(state.pendingLyricTrackIds).toEqual(['track-1']);
    expect(state.pendingArtistImageIds).toEqual(['artist-1']);
  });

  it('updates lyric maps without replacing the release or clearing selection', () => {
    const selected = releaseReducer(loaded(), {
      type: 'songToggled',
      track: release().media[0].tracks![0],
    });
    const resolved = releaseReducer(selected, {
      type: 'lyricsLoadingFinished',
      trackLyrics: { 'track-1': 'https://example.test/lyrics', 'track-2': null },
      resolvedLyricTrackIds: ['track-1'],
    });

    expect(resolved.release).toBe(selected.release);
    expect(resolved.selectedSong?.id).toBe('track-1');
    expect(resolved.pendingLyricTrackIds).toEqual([]);
    expect(resolved.trackLyrics['track-1']).toBe('https://example.test/lyrics');
  });

  it('updates artist image maps without touching the release', () => {
    const start = loaded();
    const resolved = releaseReducer(start, {
      type: 'artistImagesLoadingFinished',
      artistProfileImages: { 'artist-1': 'img.jpg' },
      resolvedArtistImageIds: ['artist-1'],
    });
    expect(resolved.release).toBe(start.release);
    expect(resolved.artistProfileImages).toEqual({ 'artist-1': 'img.jpg' });
    expect(resolved.pendingArtistImageIds).toEqual([]);
  });

  it('toggles the selected track from the visible release', () => {
    const start = loaded();
    const selected = releaseReducer(start, {
      type: 'songToggled',
      track: release().media[0].tracks![0],
    });
    const collapsed = releaseReducer(selected, {
      type: 'songToggled',
      track: release().media[0].tracks![0],
    });
    expect(selected.selectedSong?.id).toBe('track-1');
    expect(collapsed.selectedSong).toBeNull();
  });

  it('distinguishes local not-found from a retriable load failure', () => {
    const notFound = releaseReducer(createInitialReleaseState(), {
      type: 'releaseLoadFailed',
      notFound: true,
    });
    expect(notFound.releaseExists).toBe(false);
    expect(notFound.loadFailed).toBe(false);

    const failed = releaseReducer(createInitialReleaseState(), {
      type: 'releaseLoadFailed',
      notFound: false,
    });
    expect(failed.releaseExists).toBeNull();
    expect(failed.loadFailed).toBe(true);
  });
});
