import { formatDisplayDate, isOfficialReleaseStatus } from "@pawify/shared";
import { getCountryDisplay } from "./countryDisplay";

export type ReleaseEditionSummaryInput = {
  formats?: readonly string[] | null;
  trackCount?: number | null;
  date?: string | null;
  status?: string | null;
  country?: string | null;
};

const formatFormats = (
  formats: ReleaseEditionSummaryInput["formats"],
): string => {
  const unique: string[] = [];
  for (const format of formats ?? []) {
    const trimmed = format.trim();
    if (trimmed && !unique.includes(trimmed)) {
      unique.push(trimmed);
    }
  }
  return unique.join(" + ");
};

const formatTrackCount = (
  trackCount: ReleaseEditionSummaryInput["trackCount"],
): string => {
  if (
    typeof trackCount !== "number" ||
    !Number.isFinite(trackCount) ||
    trackCount <= 0
  ) {
    return "";
  }
  const rounded = Math.floor(trackCount);
  return rounded === 1 ? "1 track" : `${rounded} tracks`;
};

/**
 * Compact edition line for a release-group row:
 * `CD + DVD · 24 tracks · 14-Mar-2025 · Bootleg`.
 *
 * Unknown values are omitted rather than rendered as `0`, `Unknown date` or an
 * empty separator. `Official` is never displayed because it is the normal case and
 * would turn every row into noise.
 */
export const formatReleaseEditionSummary = ({
  formats,
  trackCount,
  date,
  status,
  country: countryCode,
}: ReleaseEditionSummaryInput): string => {
  const parts: string[] = [];

  const formatLabel = formatFormats(formats);
  if (formatLabel) {
    parts.push(formatLabel);
  }

  const trackCountLabel = formatTrackCount(trackCount);
  if (trackCountLabel) {
    parts.push(trackCountLabel);
  }

  const country = getCountryDisplay(countryCode);
  if (country) {
    parts.push(`${country.flag} ${country.code}`);
  }

  const trimmedDate = date?.trim();
  if (trimmedDate) {
    parts.push(formatDisplayDate(trimmedDate));
  }

  const trimmedStatus = status?.trim();
  if (trimmedStatus && !isOfficialReleaseStatus(trimmedStatus)) {
    parts.push(trimmedStatus);
  }

  return parts.join(" · ");
};

/** Accessibility text carries the title plus every meaningful metadata value. */
export const formatReleaseEditionAccessibilityLabel = (
  title: string,
  summary: string,
): string =>
  summary ? `Open release ${title}, ${summary}` : `Open release ${title}`;
