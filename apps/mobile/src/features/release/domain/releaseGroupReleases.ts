import type { ReleaseGroupReleaseListItem } from '@pawify/shared';
import type { ReleaseGroupReleasesResponse } from '../../../types/apiTypes';

const normalizeStringOrNull = (value: unknown): string | null =>
    typeof value === 'string' && value.trim().length > 0 ? value : null;

/**
 * Normalizes one release-group row.
 *
 * V2 servers/cached payloads predate the edition metadata. Their rows are surfaced
 * with unknown metadata (`trackCount: null`, `formats: []`) rather than being
 * mistaken for a V3 row that genuinely reports zero tracks -- the formatter then
 * omits those values instead of rendering misleading zeros.
 */
const normalizeReleaseRow = (value: unknown): ReleaseGroupReleaseListItem | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    const row = value as Partial<ReleaseGroupReleaseListItem>;
    if (typeof row.id !== 'string' || typeof row.title !== 'string') {
        return null;
    }

    return {
        id: row.id,
        title: row.title,
        date: normalizeStringOrNull(row.date),
        trackCount:
            typeof row.trackCount === 'number' && Number.isFinite(row.trackCount)
                ? row.trackCount
                : null,
        formats: Array.isArray(row.formats)
            ? row.formats.filter(
                  (format): format is string => typeof format === 'string' && format.length > 0,
              )
            : [],
        country: normalizeStringOrNull(row.country),
        status: normalizeStringOrNull(row.status),
    };
};

export function normalizeReleaseGroupReleaseListItems(
  value: unknown,
): ReleaseGroupReleaseListItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(normalizeReleaseRow)
    .filter((release): release is ReleaseGroupReleaseListItem => release !== null);
}

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
    releases: normalizeReleaseGroupReleaseListItems(record.releases),
    releaseCoverTaskId: typeof record.releaseCoverTaskId === 'string'
      ? record.releaseCoverTaskId
      : null,
    releaseCovers: record.releaseCovers && typeof record.releaseCovers === 'object'
      ? record.releaseCovers
      : {},
  };
}