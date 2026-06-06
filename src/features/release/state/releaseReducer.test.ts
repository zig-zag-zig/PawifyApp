import { describe, expect, it } from 'vitest';
import type { Release, Track } from '../../../modules/models/models';
import { createInitialReleaseState, releaseReducer } from './releaseReducer';

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
      tracks: [
        track('track-1'),
        track('track-2'),
      ],
    },
  ],
  releaseGroupId: 'release-group-1',
  cover_url: null,
  externalLinks: [],
});

describe('releaseReducer', () => {
  it('marks a loaded release visible while tracking pending lyric and artist image work', () => {
    const loaded = releaseReducer(createInitialReleaseState(), {
      type: 'lyricsLoadingStarted',
      release: release(),
      trackLyrics: { 'track-1': undefined, 'track-2': null },
      artistProfileImages: { 'artist-1': undefined },
      pendingLyricTrackIds: ['track-1'],
      pendingArtistImageIds: ['artist-1'],
    });

    expect(loaded).toMatchObject({
      releaseExists: true,
      checkingExistence: false,
      loadingLyrics: true,
      pendingLyricTrackIds: ['track-1'],
      pendingArtistImageIds: ['artist-1'],
      selectedSong: null,
    });
  });

  it('removes resolved lyric work and toggles the selected track from the visible release', () => {
    const visibleRelease = release();
    const loaded = releaseReducer(createInitialReleaseState(), {
      type: 'lyricsLoadingStarted',
      release: visibleRelease,
      trackLyrics: { 'track-1': undefined, 'track-2': undefined },
      artistProfileImages: {},
      pendingLyricTrackIds: ['track-1', 'track-2'],
      pendingArtistImageIds: [],
    });
    const withOneLyricResolved = releaseReducer(loaded, {
      type: 'lyricsLoadingFinished',
      release: visibleRelease,
      trackLyrics: { 'track-1': 'https://example.test/lyrics', 'track-2': undefined },
      resolvedLyricTrackIds: ['track-1'],
    });
    const selected = releaseReducer(withOneLyricResolved, {
      type: 'songToggled',
      track: visibleRelease.media[0].tracks![0],
    });
    const collapsed = releaseReducer(selected, {
      type: 'songToggled',
      track: visibleRelease.media[0].tracks![0],
    });

    expect(withOneLyricResolved).toMatchObject({
      loadingLyrics: true,
      pendingLyricTrackIds: ['track-2'],
    });
    expect(selected.selectedSong?.id).toBe('track-1');
    expect(collapsed.selectedSong).toBeNull();
  });

  it('clears stale release details when the selected release no longer exists', () => {
    const loaded = releaseReducer(createInitialReleaseState(), {
      type: 'lyricsLoadingStarted',
      release: release(),
      trackLyrics: { 'track-1': null },
      artistProfileImages: { 'artist-1': null },
      pendingLyricTrackIds: ['track-2'],
      pendingArtistImageIds: ['artist-1'],
    });

    expect(releaseReducer(loaded, { type: 'releaseLoadFailed' })).toEqual({
      ...createInitialReleaseState(),
      releaseExists: false,
      checkingExistence: false,
    });
  });
});
