import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useAuth } from '../../../contexts/AuthContext';
import { useCache } from '../../../contexts/CacheContext';
import { useArtistsApi } from '../api/artistsApi';
import { useOnAppForeground } from '../../../hooks/useOnAppForeground';
import useTaskManager from '../../../hooks/useTaskManager';
import { ArtistMinimal } from '@pawify/shared';
import { EventService } from '../../../services/eventService';
import { resolveNullableTaskMap } from '../../../shared/taskResults/resolveNullableTaskMap';
import { applyFollowOverrides, type FollowingOverride } from '../domain/followOverrides';
import { mergeUniqueIds, removeIds } from '../../../utils/arrays';
import { shouldRunForegroundRefresh } from '../../../utils/foregroundRefreshPolicy';
import { mergeNullableStringMaps, normalizeNullableStringMap } from '../../../utils/nullableMaps';
import { extractArtistProfileImages } from '../../../utils/taskResultMaps';

export interface FollowingContextValue {
  followingArtists: ArtistMinimal[];
  isLoadingFollowing: boolean;
  hasLoadedFollowingOnce: boolean;
  pendingArtistImageIds: string[];
  pendingEventUpdateRef: React.RefObject<boolean>;
  eventVersion: number;
  refreshFollowing: () => void;
  setFollowedArtist: (artist: ArtistMinimal, isFollowing: boolean) => void;
  /** Resolves artwork for the page currently on screen; never the whole list. */
  requestArtistImages: (artistIds: string[]) => Promise<void>;
}

type FollowingFetchReason = 'user-change' | 'event' | 'foreground-resume' | 'manual-refresh';

export function useFollowingController(): FollowingContextValue {
  const [followingArtists, setFollowingArtists] = useState<ArtistMinimal[]>([]);
  const { user } = useAuth();
  const { tasks, addTask, removeTask, executeTask } = useTaskManager();
  const [taskId, setTaskId] = useState<string | null>(null);
  const [isLoadingFollowing, setIsLoadingFollowing] = useState(true);
  const [hasLoadedFollowingOnce, setHasLoadedFollowingOnce] = useState(false);
  const [pendingArtistImageIds, setPendingArtistImageIds] = useState<string[]>([]);
  const [eventVersion, setEventVersion] = useState(0);
  const { artistProfileImages, setArtistProfileImages } = useCache();
  const artistsApi = useArtistsApi();
  const pendingEventUpdateRef = useRef(false);
  const artistProfileImagesRef = useRef(artistProfileImages);
  const taskIdRef = useRef<string | null>(null);
  const queuedFetchReasonRef = useRef<FollowingFetchReason | null>(null);
  const followOverridesRef = useRef<Map<string, FollowingOverride>>(new Map());
  const overrideVersionRef = useRef(0);
  const fetchVersionsRef = useRef<Map<string, number>>(new Map());
  const requestedImageIdsRef = useRef<Set<string>>(new Set());
  const userId = user?.uid ?? null;

  useEffect(() => {
    artistProfileImagesRef.current = artistProfileImages;
  }, [artistProfileImages]);

  const updateTaskId = useCallback((nextTaskId: string | null) => {
    taskIdRef.current = nextTaskId;
    setTaskId(nextTaskId);
  }, []);

  const removePendingArtistImages = useCallback((artistIds: string[]) => {
    setPendingArtistImageIds(prev => removeIds(prev, artistIds));
  }, []);

  const fetchArtists = useCallback(async (reason: FollowingFetchReason) => {
    try {
      if (!userId) {
        followOverridesRef.current.clear();
        queuedFetchReasonRef.current = null;
        setFollowingArtists([]);
        setHasLoadedFollowingOnce(false);
        setPendingArtistImageIds([]);
        if (taskIdRef.current) {
          removeTask(taskIdRef.current);
          updateTaskId(null);
        }
        setIsLoadingFollowing(false);
        return;
      }

      if (taskIdRef.current) {
        queuedFetchReasonRef.current = reason;
        return;
      }

      setIsLoadingFollowing(true);
      const task = addTask(() => artistsApi.getFollowing(), 'getFollowing', {
        origin: reason,
        replayPolicy: 'both',
      });
      // Version at fetch start: overrides created after this fetch began must
      // survive it, because the response cannot reflect those mutations.
      fetchVersionsRef.current.set(task.id, overrideVersionRef.current);
      updateTaskId(task.id);
      void executeTask(task);
    } catch (error) {
      console.error('follow-context: queue following fetch task failed', error);
    }
  }, [addTask, executeTask, artistsApi, removeTask, updateTaskId, userId]);

  /**
   * Resolves artwork for one page of the list.
   *
   * The feed response only carries covers that are already cached, so nothing is
   * fetched until the Artists screen asks for the rows it is about to render.
   */
  const requestArtistImages = useCallback(async (artistIds: string[]) => {
    const current = artistProfileImagesRef.current;
    const idsToRequest = artistIds.filter(artistId =>
      current[artistId] === undefined && !requestedImageIdsRef.current.has(artistId)
    );

    if (idsToRequest.length === 0) {
      return;
    }

    for (const artistId of idsToRequest) {
      requestedImageIdsRef.current.add(artistId);
    }
    setPendingArtistImageIds(prev => mergeUniqueIds(prev, idsToRequest));

    try {
      const result = await artistsApi.resolveFollowingArtistImages(idsToRequest);
      const resolved = normalizeNullableStringMap(result.profileImages);

      if (Object.keys(resolved).length > 0) {
        setArtistProfileImages(prev => mergeNullableStringMaps(prev, resolved));
      }

      const stillPendingIds = idsToRequest.filter(
        artistId => resolved[artistId] === undefined
      );
      const settledIds = idsToRequest.filter(artistId => resolved[artistId] !== undefined);
      if (settledIds.length > 0) {
        removePendingArtistImages(settledIds);
      }

      if (result.profileImageTaskId && stillPendingIds.length > 0) {
        await resolveNullableTaskMap({
          taskId: result.profileImageTaskId,
          expectedIds: stillPendingIds,
          waitForTaskResult: artistsApi.waitForTaskResultById,
          extractMap: extractArtistProfileImages,
          onResolvedValues: (artistProfileImages, resolvedArtistIds) => {
            setArtistProfileImages(prev => mergeNullableStringMaps(prev, artistProfileImages));
            removePendingArtistImages(resolvedArtistIds);
          },
          onError: error => {
            console.error('follow-context: resolve artist profile image task failed', error);
          },
          shouldFillMissingOnCompleted: taskResult => (taskResult.subtaskCount ?? 0) === 0,
        });
      }
    } catch (error) {
      console.error('follow-context: request artist images failed', error);
      removePendingArtistImages(idsToRequest);
      // Allow a later scroll to retry; nothing was resolved.
      for (const artistId of idsToRequest) {
        requestedImageIdsRef.current.delete(artistId);
      }
    }
  }, [
    artistsApi,
    removePendingArtistImages,
    setArtistProfileImages,
  ]);

  const handleFollowingEvent = useCallback((eventName: string, options?: { force?: boolean }) => {
    if (eventName !== 'following') {
      return false;
    }

    if (!options?.force && AppState.currentState !== 'active') {
      return true;
    }

    pendingEventUpdateRef.current = true;
    setEventVersion(value => value + 1);
    void fetchArtists('event');
    EventService.consumeEvent(eventName);
    return true;
  }, [fetchArtists]);

  useEffect(() => {
    EventService.getPendingEvents().forEach((_, eventName) => {
      handleFollowingEvent(eventName, { force: AppState.currentState === 'active' });
    });

    const unsubscribe = EventService.addListener((eventName) => {
      handleFollowingEvent(eventName);
    });

    return () => {
      unsubscribe();
    };
  }, [handleFollowingEvent]);

  useEffect(() => {
    followOverridesRef.current.clear();
    fetchVersionsRef.current.clear();
    overrideVersionRef.current = 0;
    queuedFetchReasonRef.current = null;
    setFollowingArtists([]);
    setHasLoadedFollowingOnce(false);
    setPendingArtistImageIds([]);
    requestedImageIdsRef.current.clear();
    setIsLoadingFollowing(userId !== null);

    if (taskIdRef.current) {
      removeTask(taskIdRef.current);
      updateTaskId(null);
    }
  }, [removeTask, updateTaskId, userId]);

  useEffect(() => {
    void fetchArtists('user-change');
  }, [fetchArtists, userId]);

  useOnAppForeground(({ inactiveMs }) => {
    if (!user) {
      return;
    }

    if (EventService.getPendingEvents().has('following')) {
      handleFollowingEvent('following', { force: true });
      return;
    }

    if (Platform.OS === 'ios' && shouldRunForegroundRefresh(inactiveMs)) {
      void fetchArtists('foreground-resume');
    }
  });

  const refreshFollowing = useCallback(() => {
    void fetchArtists('manual-refresh');
  }, [fetchArtists]);

  const setFollowedArtist = useCallback((artist: ArtistMinimal, isFollowing: boolean) => {
    overrideVersionRef.current += 1;
    followOverridesRef.current.set(artist.id, {
      artist,
      isFollowing,
      version: overrideVersionRef.current,
    });

    setFollowingArtists(prev => {
      if (!isFollowing) {
        return prev.filter(item => item.id !== artist.id);
      }

      if (prev.some(item => item.id === artist.id)) {
        return prev.map(item => item.id === artist.id ? artist : item);
      }

      return [...prev, artist];
    });
  }, []);

  useEffect(() => {
    const checkTasks = async () => {
      if (tasks.length === 0) return;

      if (taskId) {
        const task = tasks.find((task) => task.id === taskId);
        if (task && (task.result !== undefined || task.error)) {
          removeTask(task.id);
          if (taskIdRef.current === task.id) {
            updateTaskId(null);
          }
          setIsLoadingFollowing(false);

          if (task.error) {
            console.error('follow-context: fetch following task failed', task.error);
            const queuedReason = queuedFetchReasonRef.current;
            queuedFetchReasonRef.current = null;
            if (queuedReason) {
              void fetchArtists(queuedReason);
            }
            return;
          }

          const result = task.result as {
            artists: ArtistMinimal[];
            profileImages?: Record<string, string | null>;
          } | undefined;
          const appliedVersion = fetchVersionsRef.current.get(task.id) ?? overrideVersionRef.current;
          fetchVersionsRef.current.delete(task.id);
          const { artists, remainingOverrides } = applyFollowOverrides(
            result?.artists ?? [],
            followOverridesRef.current,
            appliedVersion,
          );
          followOverridesRef.current = remainingOverrides;
          setFollowingArtists(artists);
          setHasLoadedFollowingOnce(true);

          const immediateProfileImages = normalizeNullableStringMap(result?.profileImages);
          if (Object.keys(immediateProfileImages).length > 0) {
            setArtistProfileImages(prev => mergeNullableStringMaps(prev, immediateProfileImages));
          }

          const queuedReason = queuedFetchReasonRef.current;
          queuedFetchReasonRef.current = null;
          if (queuedReason) {
            void fetchArtists(queuedReason);
          }
        }
      }
    }

    void checkTasks();
  }, [fetchArtists, removeTask, taskId, tasks, updateTaskId]);

  return {
    followingArtists,
    isLoadingFollowing,
    hasLoadedFollowingOnce,
    pendingArtistImageIds,
    pendingEventUpdateRef,
    eventVersion,
    refreshFollowing,
    setFollowedArtist,
    requestArtistImages,
  };
}
