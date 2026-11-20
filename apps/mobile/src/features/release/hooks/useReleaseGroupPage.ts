import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCache } from "../../../contexts/CacheContext";
import type { ArtistCredit, ReleaseGroupReleaseListItem } from "@pawify/shared";
import { isApiCallError } from "../../../services/apiErrors";
import { resolveNullableTaskMap } from "../../../shared/taskResults/resolveNullableTaskMap";
import {
  ReleaseNavigationProp,
  RootStackParamList,
} from "../../../types/navigation";
import {
  mergeNullableStringMaps,
  normalizeNullableStringMap,
} from "../../../utils/nullableMaps";
import { extractReleaseGroupReleaseCovers } from "../../../utils/taskResultMaps";
import { useReleaseApi } from "../api/releaseApi";
import type { ReleaseGroupPageController } from "../model/types";

type ReleaseGroupRouteProp = RouteProp<RootStackParamList, "ReleaseGroup">;

/**
 * One group-loading path.
 *
 * Every entry point (artist, search, feed, deep link) navigates with the group id
 * only. This screen performs the v3 local-data request itself; there is no artist
 * prefetch, route-carried edition payload, old-response normalization, or second
 * catalogue spinner.
 */
export function useReleaseGroupPage(): ReleaseGroupPageController {
  const route = useRoute<ReleaseGroupRouteProp>();
  const navigation = useNavigation<ReleaseNavigationProp>();
  const { releaseGroupReleaseCovers, setReleaseGroupReleaseCovers } =
    useCache();
  const {
    getReleaseGroupReleases,
    resolveReleaseGroupReleaseCovers,
    waitForTaskResultById,
  } = useReleaseApi();
  const releaseGroupId = route.params.releaseGroupId;
  const [releaseGroupTitle, setReleaseGroupTitle] = useState<string | null>(
    null,
  );
  const [groupArtistCredit, setGroupArtistCredit] = useState<ArtistCredit[]>(
    [],
  );
  const [releases, setReleases] = useState<ReleaseGroupReleaseListItem[]>([]);
  const [releaseCount, setReleaseCount] = useState(0);
  const [pendingReleaseCoverIds, setPendingReleaseCoverIds] = useState<
    string[]
  >([]);
  const [isLoadingReleases, setIsLoadingReleases] = useState(true);
  const [releaseLoadFailed, setReleaseLoadFailed] = useState(false);
  const [releaseGroupNotFound, setReleaseGroupNotFound] = useState(false);
  const generationRef = useRef(0);
  const coversRef = useRef(releaseGroupReleaseCovers);

  useEffect(() => {
    coversRef.current = releaseGroupReleaseCovers;
  }, [releaseGroupReleaseCovers]);

  const loadGroup = useCallback(
    async (generation: number) => {
      const isCurrent = () => generationRef.current === generation;
      setIsLoadingReleases(true);
      setReleaseLoadFailed(false);
      setReleaseGroupNotFound(false);

      try {
        const response = await getReleaseGroupReleases(releaseGroupId);
        if (!isCurrent()) {
          return;
        }

        // A one-edition group has no useful intermediate screen; deep links
        // and stale callers still land directly on that release.
        if (response.releaseCount === 1 && response.releases[0]) {
          navigation.replace("Release", { releaseId: response.releases[0].id });
          return;
        }

        const immediateCovers = normalizeNullableStringMap(
          response.releaseCovers,
        );
        setReleaseGroupTitle(response.releaseGroup.title);
        setGroupArtistCredit(response.releaseGroup["artist-credit"] ?? []);
        setReleases(response.releases);
        setReleaseCount(response.releaseCount);

        if (Object.keys(immediateCovers).length > 0) {
          setReleaseGroupReleaseCovers((prev) =>
            mergeNullableStringMaps(prev, immediateCovers),
          );
        }

        const mergedCovers = mergeNullableStringMaps(
          coversRef.current,
          immediateCovers,
        );
        const missingCoverIds = response.releaseCoverTaskId
          ? response.releases
              .map((release) => release.id)
              .filter((releaseId) => mergedCovers[releaseId] === undefined)
          : [];

        setPendingReleaseCoverIds(missingCoverIds);

        if (response.releaseCoverTaskId && missingCoverIds.length > 0) {
          void resolveNullableTaskMap({
            taskId: response.releaseCoverTaskId,
            expectedIds: missingCoverIds,
            waitForTaskResult: waitForTaskResultById,
            extractMap: extractReleaseGroupReleaseCovers,
            onResolvedValues: (covers, resolvedReleaseIds) => {
              if (!isCurrent()) {
                return;
              }
              if (Object.keys(covers).length > 0) {
                setReleaseGroupReleaseCovers((prev) => ({
                  ...prev,
                  ...covers,
                }));
              }
              setPendingReleaseCoverIds((prev) =>
                prev.filter((id) => !resolvedReleaseIds.includes(id)),
              );
            },
            onError: (error) => {
              console.error(
                "release-group-page: resolve release cover task failed",
                error,
              );
            },
            shouldFillMissingOnCompleted: () => false,
            shouldFillMissingOnError: false,
            shouldFillMissingOnNonCompleted: false,
            recreateTask: async () => {
              // Enrichment replay: only the visible pending artwork is
              // requested, never the whole edition list again.
              const replayed = await resolveReleaseGroupReleaseCovers(
                releaseGroupId,
                missingCoverIds,
              );
              const replayedCovers = normalizeNullableStringMap(
                replayed.releaseCovers,
              );
              if (Object.keys(replayedCovers).length > 0) {
                setReleaseGroupReleaseCovers((prev) =>
                  mergeNullableStringMaps(prev, replayedCovers),
                );
              }
              return replayed.releaseCoverTaskId;
            },
            recreateTaskDescription:
              "resolveReleaseGroupReleaseCovers.releaseCoverTaskId",
          });
        }
      } catch (error) {
        console.error("release-group-page: load failed", error);
        if (isCurrent()) {
          if (isApiCallError(error) && error.statusCode === 404) {
            setReleaseGroupNotFound(true);
          } else {
            setReleaseLoadFailed(true);
          }
        }
      } finally {
        if (isCurrent()) {
          setIsLoadingReleases(false);
        }
      }
    },
    [
      getReleaseGroupReleases,
      navigation,
      releaseGroupId,
      resolveReleaseGroupReleaseCovers,
      setReleaseGroupReleaseCovers,
      waitForTaskResultById,
    ],
  );

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setReleases([]);
    setReleaseCount(0);
    setPendingReleaseCoverIds([]);
    void loadGroup(generation);

    return () => {
      generationRef.current += 1;
    };
  }, [loadGroup, releaseGroupId]);

  const onReleasePressed = useCallback(
    (release: ReleaseGroupReleaseListItem) => {
      navigation.navigate("Release", { releaseId: release.id });
    },
    [navigation],
  );

  const onRetryLoadReleases = useCallback(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    void loadGroup(generation);
  }, [loadGroup]);

  return {
    state: {
      releaseGroupTitle,
      groupArtistCredit,
      releases,
      releaseCount,
      releaseGroupReleaseCovers,
      pendingReleaseCoverIds,
      isLoadingReleases,
      releaseLoadFailed,
      releaseGroupNotFound,
      releaseGroupId,
    },
    onReleasePressed,
    onRetryLoadReleases,
  };
}
