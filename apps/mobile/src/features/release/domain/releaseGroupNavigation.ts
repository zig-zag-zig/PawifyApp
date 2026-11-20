export type ReleaseGroupNavigationInput = {
  releaseGroupId?: string | null;
  releaseIds?: readonly string[] | null;
  releaseCount?: number | null;
  /** The representative release id when the caller already has one. */
  fallbackReleaseId?: string | null;
};

export type ReleaseGroupNavigationDecision =
  | { screen: "Release"; releaseId: string }
  | { screen: "ReleaseGroup"; releaseGroupId: string }
  | { screen: "Lookup"; releaseGroupId: string }
  | null;

/**
 * Decide where a release-group tap goes before any request.
 *
 * A group with exactly one edition opens that release directly. If the caller
 * does not know the edition ids/count (search results, deep links), the caller
 * looks the group up first. A group with several editions opens the group.
 */
export const decideReleaseGroupNavigation = ({
  releaseGroupId,
  releaseIds,
  releaseCount,
  fallbackReleaseId,
}: ReleaseGroupNavigationInput): ReleaseGroupNavigationDecision => {
  const groupId = releaseGroupId?.trim() || null;
  if (!groupId) {
    return fallbackReleaseId
      ? { screen: "Release", releaseId: fallbackReleaseId }
      : null;
  }

  const ids = Array.from(new Set((releaseIds ?? []).filter(Boolean)));
  if (ids.length === 1) {
    return { screen: "Release", releaseId: ids[0]! };
  }
  if (ids.length > 1) {
    return { screen: "ReleaseGroup", releaseGroupId: groupId };
  }

  if (releaseCount === 1) {
    return fallbackReleaseId
      ? { screen: "Release", releaseId: fallbackReleaseId }
      : { screen: "Lookup", releaseGroupId: groupId };
  }
  if (typeof releaseCount === "number" && releaseCount > 1) {
    return { screen: "ReleaseGroup", releaseGroupId: groupId };
  }

  return { screen: "Lookup", releaseGroupId: groupId };
};
