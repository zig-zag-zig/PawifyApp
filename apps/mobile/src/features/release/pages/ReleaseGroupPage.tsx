import React from "react";
import { useNavigation } from "@react-navigation/native";
import type { ArtistNavigationProp } from "../../../types/navigation";
import ReleaseGroupView from "../components/ReleaseGroupView";
import { useReleaseGroupPage } from "../hooks/useReleaseGroupPage";

const ReleaseGroupPage = () => {
  const releaseGroupPage = useReleaseGroupPage();
  const navigation = useNavigation<ArtistNavigationProp>();

  return (
    <ReleaseGroupView
      releaseGroupTitle={releaseGroupPage.state.releaseGroupTitle}
      releases={releaseGroupPage.state.releases}
      releaseCount={releaseGroupPage.state.releaseCount}
      groupArtistCredit={releaseGroupPage.state.groupArtistCredit}
      releaseGroupReleaseCovers={
        releaseGroupPage.state.releaseGroupReleaseCovers
      }
      pendingReleaseCoverIds={releaseGroupPage.state.pendingReleaseCoverIds}
      isLoadingReleases={releaseGroupPage.state.isLoadingReleases}
      releaseLoadFailed={releaseGroupPage.state.releaseLoadFailed}
      releaseGroupNotFound={releaseGroupPage.state.releaseGroupNotFound}
      releaseGroupId={releaseGroupPage.state.releaseGroupId}
      onArtistPress={(artistId) => navigation.navigate("Artist", { artistId })}
      onReleasePressed={releaseGroupPage.onReleasePressed}
      onRetryLoadReleases={releaseGroupPage.onRetryLoadReleases}
    />
  );
};

export default ReleaseGroupPage;
