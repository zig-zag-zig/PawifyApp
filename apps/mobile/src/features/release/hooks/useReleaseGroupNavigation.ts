import { useNavigation } from "@react-navigation/native";
import { useCallback, useRef } from "react";
import type { ReleaseGroupNavigationProp } from "../../../types/navigation";
import { useReleaseApi } from "../api/releaseApi";
import {
  decideReleaseGroupNavigation,
  type ReleaseGroupNavigationInput,
} from "../domain/releaseGroupNavigation";

/**
 * Single entry point for opening a release group from any screen.
 *
 * When the caller does not know the edition count, this performs one group request
 * and still lands directly on the release for one-edition groups.
 */
export const useReleaseGroupNavigation = () => {
  const navigation = useNavigation<ReleaseGroupNavigationProp>();
  const { getReleaseGroupReleases } = useReleaseApi();
  const pendingGroupsRef = useRef<Set<string>>(new Set());

  const openReleaseGroup = useCallback(
    async (input: ReleaseGroupNavigationInput): Promise<void> => {
      const decision = decideReleaseGroupNavigation(input);
      if (!decision) {
        return;
      }

      if (decision.screen === "Release") {
        navigation.navigate("Release", { releaseId: decision.releaseId });
        return;
      }
      if (decision.screen === "ReleaseGroup") {
        navigation.navigate("ReleaseGroup", {
          releaseGroupId: decision.releaseGroupId,
        });
        return;
      }

      if (pendingGroupsRef.current.has(decision.releaseGroupId)) {
        return;
      }
      pendingGroupsRef.current.add(decision.releaseGroupId);
      try {
        const group = await getReleaseGroupReleases(decision.releaseGroupId);
        if (group.releaseCount === 1 && group.releases[0]) {
          navigation.navigate("Release", { releaseId: group.releases[0].id });
          return;
        }
        navigation.navigate("ReleaseGroup", {
          releaseGroupId: decision.releaseGroupId,
        });
      } catch {
        // The group screen owns the retry/error state.
        navigation.navigate("ReleaseGroup", {
          releaseGroupId: decision.releaseGroupId,
        });
      } finally {
        pendingGroupsRef.current.delete(decision.releaseGroupId);
      }
    },
    [getReleaseGroupReleases, navigation],
  );

  return { openReleaseGroup };
};
