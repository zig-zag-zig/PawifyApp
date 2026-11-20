import { useNavigation } from "@react-navigation/native";
import {
  useCallback,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { useToast } from "../../../contexts/ToastContext";
import type { Artist, ArtistReleaseGroup } from "@pawify/shared";
import { getUserFacingErrorMessage } from "../../../services/userFacingErrors";
import { ArtistNavigationProp } from "../../../types/navigation";
import { useReleaseGroupNavigation } from "../../release/hooks/useReleaseGroupNavigation";
import type { PendingTaskKey } from "../model/types";
import type { ArtistPageAction } from "../state/artistReducer";

type PendingTaskRef = RefObject<{
  artistTaskId: string | null;
}>;

type ArtistPageActionsOptions = {
  artistId: string | undefined;
  artist: Artist | undefined;
  isFollowing: boolean;
  isFollowLoading: boolean;
  artistIdRef: RefObject<string | undefined>;
  pendingTaskRef: PendingTaskRef;
  followToggleInFlightRef: RefObject<boolean>;
  isMountedRef: RefObject<boolean>;
  dispatch: Dispatch<ArtistPageAction>;
  setOptimisticFollowing: Dispatch<SetStateAction<boolean | null>>;
  setFollowedArtist: (artist: Artist, followed: boolean) => void;
  followArtist: (artistId: string) => Promise<unknown>;
  unfollowArtist: (artistId: string) => Promise<unknown>;
  removeTask: (taskId: string) => void;
  updatePendingTask: (key: PendingTaskKey, taskId: string | null) => void;
};

export function useArtistPageActions({
  artistId,
  artist,
  isFollowing,
  isFollowLoading,
  artistIdRef,
  pendingTaskRef,
  followToggleInFlightRef,
  isMountedRef,
  dispatch,
  setOptimisticFollowing,
  setFollowedArtist,
  followArtist,
  unfollowArtist,
  removeTask,
  updatePendingTask,
}: ArtistPageActionsOptions) {
  const { showToast } = useToast();
  const { openReleaseGroup } = useReleaseGroupNavigation();
  const artistNavigation = useNavigation<ArtistNavigationProp>();

  const handleToggleFollow = useCallback(async () => {
    if (
      !artistId ||
      !artist ||
      isFollowLoading ||
      followToggleInFlightRef.current
    )
      return;

    followToggleInFlightRef.current = true;
    const wasFollowing = isFollowing;
    const nextFollowing = !wasFollowing;

    try {
      dispatch({ type: "followToggleStarted" });
      setOptimisticFollowing(nextFollowing);

      if (wasFollowing) {
        await unfollowArtist(artistId);
        setFollowedArtist(artist, false);
        return;
      }

      await followArtist(artist.id);
      setFollowedArtist(artist, true);
    } catch (error) {
      console.error("artist-page: follow toggle failed", error);
      showToast(
        `${wasFollowing ? "Unfollowing" : "Following"} artist ${artist.name} failed.`,
        "error",
      );
      if (isMountedRef.current) {
        setOptimisticFollowing(wasFollowing);
      }
    } finally {
      followToggleInFlightRef.current = false;
      if (isMountedRef.current) {
        dispatch({ type: "followToggleFinished" });
      }
    }
  }, [
    artist,
    artistId,
    dispatch,
    followArtist,
    followToggleInFlightRef,
    isFollowLoading,
    isFollowing,
    isMountedRef,
    setFollowedArtist,
    setOptimisticFollowing,
    showToast,
    unfollowArtist,
  ]);

  const handleArtistPressed = useCallback(
    (targetArtistId: string) => {
      artistNavigation.push("Artist", { artistId: targetArtistId });

      if (pendingTaskRef.current.artistTaskId) {
        removeTask(pendingTaskRef.current.artistTaskId);
        updatePendingTask("artistTaskId", null);
      }
    },
    [artistNavigation, pendingTaskRef, removeTask, updatePendingTask],
  );

  const handleReleaseGroupPressed = useCallback(
    async (releaseGroup: ArtistReleaseGroup) => {
      if (!releaseGroup?.id) {
        showToast(
          "Could not open this release group because its id is missing.",
          "error",
        );
        return;
      }

      // One-edition groups open the release directly; larger groups open the
      // group screen. The artist payload already carries the edition ids.
      await openReleaseGroup({
        releaseGroupId: releaseGroup.id,
        releaseIds: releaseGroup.releaseIds,
      });
    },
    [openReleaseGroup, showToast],
  );

  return {
    handleArtistPressed,
    handleReleaseGroupPressed,
    handleToggleFollow,
  };
}
