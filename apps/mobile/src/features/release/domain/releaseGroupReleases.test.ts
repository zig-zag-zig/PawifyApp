import { describe, expect, it } from 'vitest';
import { normalizeReleaseGroupReleasesResponse } from './releaseGroupReleases';

describe('normalizeReleaseGroupReleasesResponse', () => {
  it('keeps valid release group release responses', () => {
    const response = normalizeReleaseGroupReleasesResponse({
      releases: [{ id: 'release-1', title: 'Release 1' }],
      releaseCoverTaskId: 'cover-task-1',
      releaseCovers: { 'release-1': 'https://example.test/cover.jpg' },
    });

    expect(response).toEqual({
      releases: [{ id: 'release-1', title: 'Release 1' }],
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
});
