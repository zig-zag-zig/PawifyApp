export const nameWithDisambiguation = (disambiguation: string | null, name: string) => disambiguation ? name + ' (' + disambiguation + ')' : name;

/** MusicBrainz statuses are compared case-insensitively; Official is never a chip. */
export const isOfficialReleaseStatus = (status: string | null | undefined): boolean =>
  status?.trim().toLowerCase() === 'official';

export type ReleaseEventMetadata = {
  notificationReason?: 'new-group' | 'more-tracks' | 'new-edition' | null;
  trackCount?: number | null;
  editionKeywords?: readonly string[] | null;
};

/**
 * Compact explanation for a feed/push entry that came from edition content.
 *
 * Returns an empty string for a plain new group: the event reason is only worth
 * surfacing when something changed *within* a known group.
 */
export const formatReleaseEventMetadata = ({
  notificationReason,
  trackCount,
  editionKeywords,
}: ReleaseEventMetadata): string => {
  if (notificationReason !== 'more-tracks' && notificationReason !== 'new-edition') {
    return '';
  }

  const parts: string[] = [];
  const keyword = editionKeywords?.find((value) => value.trim().length > 0)?.trim();
  if (keyword) {
    parts.push(`${keyword.charAt(0).toUpperCase()}${keyword.slice(1)} edition`);
  }

  if (typeof trackCount === 'number' && Number.isFinite(trackCount) && trackCount > 0) {
    const rounded = Math.floor(trackCount);
    parts.push(rounded === 1 ? '1 track' : `${rounded} tracks`);
  }

  return parts.join(' · ');
};

type ReleaseMediaMetadata = {
  media?: ReadonlyArray<{
    'track-count'?: number | null;
    format?: string | null;
  }> | null;
};

/**
 * Edition metadata derived from a release's media list.
 *
 * `trackCount` is the sum of the media `track-count` fields, not the number of
 * track rows: list responses intentionally carry media metadata without loading a
 * full tracklist. It stays null when the release has no media data at all so the
 * client can omit the value instead of rendering a misleading zero.
 */
export const deriveReleaseGroupReleaseListMetadata = (
  release: ReleaseMediaMetadata,
): { trackCount: number | null; formats: string[] } => {
  let trackCount: number | null = null;
  const formats: string[] = [];

  for (const medium of release.media ?? []) {
    const mediumTrackCount = medium['track-count'];
    if (
      typeof mediumTrackCount === 'number' &&
      Number.isFinite(mediumTrackCount) &&
      mediumTrackCount >= 0
    ) {
      trackCount = (trackCount ?? 0) + mediumTrackCount;
    }

    const format = medium.format?.trim();
    if (format && !formats.includes(format)) {
      formats.push(format);
    }
  }

  return { trackCount, formats };
};