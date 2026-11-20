import React from "react";
import type { ArtistCredit, ReleaseGroupReleaseListItem } from "@pawify/shared";
import ReleaseGroupCard from "./ReleaseGroupCard";

interface ReleaseGroupViewProps {
  releaseGroupTitle: string | null;
  releases: ReleaseGroupReleaseListItem[];
  releaseCount: number;
  groupArtistCredit?: ArtistCredit[];
  releaseGroupReleaseCovers: Record<string, string | null | undefined>;
  pendingReleaseCoverIds: string[];
  isLoadingReleases: boolean;
  releaseLoadFailed: boolean;
  releaseGroupNotFound: boolean;
  releaseGroupId: string | null;
  onArtistPress?: (artistId: string) => void;
  onReleasePressed: (release: ReleaseGroupReleaseListItem) => void;
  onRetryLoadReleases: () => void;
}

const ReleaseGroupView = ({
  releaseGroupTitle,
  releases,
  releaseCount,
  groupArtistCredit,
  releaseGroupReleaseCovers,
  pendingReleaseCoverIds,
  isLoadingReleases,
  releaseLoadFailed,
  releaseGroupNotFound,
  releaseGroupId,
  onArtistPress,
  onReleasePressed,
  onRetryLoadReleases,
}: ReleaseGroupViewProps) => (
  <ReleaseGroupCard
    releaseGroupTitle={releaseGroupTitle}
    releases={releases}
    releaseCount={releaseCount}
    groupArtistCredit={groupArtistCredit}
    releaseCovers={releaseGroupReleaseCovers}
    pendingReleaseCoverIds={pendingReleaseCoverIds}
    releaseGroupId={releaseGroupId}
    onArtistPress={onArtistPress}
    isLoadingReleases={isLoadingReleases}
    releaseLoadFailed={releaseLoadFailed}
    releaseGroupNotFound={releaseGroupNotFound}
    onPress={onReleasePressed}
    onRetryLoadReleases={onRetryLoadReleases}
    onContentReady={() => undefined}
  />
);

export default ReleaseGroupView;
