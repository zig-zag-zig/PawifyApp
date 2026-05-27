import { describe, expect, it } from 'vitest';
import {
  extractArtistProfileImages,
  extractReleaseGroupCovers,
  extractReleaseTrackLyrics,
} from './taskResultMaps';

describe('task result map extraction', () => {
  it('extracts artist image maps from wrapped payloads and terminal missing records', () => {
    const result = {
      payload: {
        artistProfileImages: [
          { artistId: 'artist-1', profileImageUrl: ' https://cdn.example/a.jpg ' },
          { id: 'artist-2', exists: false },
          { id: 'artist-3', value: '' },
          { id: 'artist-4', ignored: 123 },
        ],
      },
    };

    expect(extractArtistProfileImages(result)).toEqual({
      'artist-1': 'https://cdn.example/a.jpg',
      'artist-2': null,
      'artist-3': null,
    });
  });

  it('accepts JSON string task results and nested value wrappers', () => {
    const result = JSON.stringify({
      release_tracks_lyrics: {
        trackA: { data: { lyrics: 'Line one\nLine two' } },
        trackB: JSON.stringify({ status: 'not_found' }),
        trackC: undefined,
      },
    });

    expect(extractReleaseTrackLyrics(result)).toEqual({
      trackA: 'Line one\nLine two',
      trackB: null,
    });
  });

  it('maps array pair results for release group covers', () => {
    expect(extractReleaseGroupCovers([
      ['rg-1', { coverUrl: 'https://cdn.example/cover.jpg' }],
      ['rg-2', { result: 'missing' }],
      ['rg-3', { coverUrl: '   ' }],
    ])).toEqual({
      'rg-1': 'https://cdn.example/cover.jpg',
      'rg-2': null,
      'rg-3': null,
    });
  });
});
