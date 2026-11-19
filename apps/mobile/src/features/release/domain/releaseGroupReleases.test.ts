import { describe, expect, it } from 'vitest';
import {
  normalizeReleaseGroupReleaseListItems,
  normalizeReleaseGroupReleasesResponse,
} from './releaseGroupReleases';

describe('normalizeReleaseGroupReleasesResponse', () => {
  it('keeps valid release group release responses', () => {
    const response = normalizeReleaseGroupReleasesResponse({
      releases: [
        {
          id: 'release-1',
          title: 'Release 1',
          date: '2025-03-14',
          trackCount: 18,
          formats: ['CD'],
          country: 'US',
          status: 'Official',
        },
      ],
      releaseCoverTaskId: 'cover-task-1',
      releaseCovers: { 'release-1': 'https://example.test/cover.jpg' },
    });

    expect(response).toEqual({
      releases: [
        {
          id: 'release-1',
          title: 'Release 1',
          date: '2025-03-14',
          trackCount: 18,
          formats: ['CD'],
          country: 'US',
          status: 'Official',
        },
      ],
      releaseCoverTaskId: 'cover-task-1',
      releaseCovers: { 'release-1': 'https://example.test/cover.jpg' },
    });
  });

  it('rejects incomplete responses without a releases array', () => {
    expect(normalizeReleaseGroupReleasesResponse({ releaseCoverTaskId: 'cover-task-1' })).toBeNull();
    expect(normalizeReleaseGroupReleasesResponse(undefined)).toBeNull();
  });

  it('normalizes a missing release cover task id and covers', () => {
    expect(normalizeReleaseGroupReleasesResponse({ releases: [] })).toEqual({
      releases: [],
      releaseCoverTaskId: null,
      releaseCovers: {},
    });
  });

  it('treats a V2-shaped row as unknown metadata, not a valid V3 row', () => {
    // Payloads cached by a V2 server only carried id/title/date. Missing edition
    // fields must normalize to unknown values so the formatter omits them instead
    // of rendering "0 tracks" or an empty separator.
    expect(
      normalizeReleaseGroupReleaseListItems([
        { id: 'release-1', title: 'Release 1', date: '2025-03-14' },
      ]),
    ).toEqual([
      {
        id: 'release-1',
        title: 'Release 1',
        date: '2025-03-14',
        trackCount: null,
        formats: [],
        country: null,
        status: null,
      },
    ]);
  });

  it('drops rows without id or title and cleans metadata values', () => {
    expect(
      normalizeReleaseGroupReleaseListItems([
        { title: 'Missing id' },
        { id: 'release-1', title: 'Release 1', formats: ['CD', '', 5], trackCount: Number.NaN },
      ]),
    ).toEqual([
      {
        id: 'release-1',
        title: 'Release 1',
        date: null,
        trackCount: null,
        formats: ['CD'],
        country: null,
        status: null,
      },
    ]);
  });
});