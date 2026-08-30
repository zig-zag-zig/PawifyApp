import type { ReleaseGroupReleasesResponse } from '../../../types/apiTypes';

export function normalizeReleaseGroupReleasesResponse(
  response: unknown,
): ReleaseGroupReleasesResponse | null {
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    return null;
  }

  const record = response as Partial<ReleaseGroupReleasesResponse>;

  if (!Array.isArray(record.releases)) {
    return null;
  }

  return {
    releases: record.releases,
    releaseCoverTaskId: typeof record.releaseCoverTaskId === 'string'
      ? record.releaseCoverTaskId
      : null,
    releaseCovers: record.releaseCovers && typeof record.releaseCovers === 'object'
      ? record.releaseCovers
      : {},
  };
}
