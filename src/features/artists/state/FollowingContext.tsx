import React, { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useAuth } from '../../../contexts/AuthContext';
import { useCache } from '../../../contexts/CacheContext';
import { useApiClient } from '../../../hooks/useApiClient';
import { useOnAppForeground } from '../../../hooks/useOnAppForeground';
import useTaskManager from '../../../hooks/useTaskManager';
import { ArtistMinimal } from '../../../shared/music';
import { EventService } from '../../../services/eventService';
import { resolveNullableTaskMap } from '../../../shared/taskResults/resolveNullableTaskMap';
import type { FollowingResponse, TaskResultResponse } from '../../../types/apiTypes';
import { mergeNullableStringMaps } from '../../../utils/nullableMaps';
import { extractArtistProfileImages } from '../../../utils/taskResultMaps';

interface FollowingContextType {
  followingArtists: ArtistMinimal[];
  isLoadingFollowing: boolean;
  hasLoadedFollowingOnce: boolean;
  pendingArtistImageIds: string[];
  pendingEventUpdateRef: React.RefObject<boolean>;
  eventVersion: number;
  refreshFollowing: () => void;
  setFollowedArtist: (artist: ArtistMinimal, isFollowing: boolean) => void;
}

type FollowingFetchReason = 'user-change' | 'event' | 'foreground-resume' | 'manual-refresh';
type FollowingOverride = {
  artist: ArtistMinimal;
  isFollowing: boolean;
};

const FollowingContext = createContext<FollowingContextType | null>(null);
const iosForegroundRefreshMinInactiveMs = 5 * 60 * 1000;

const mergeUniqueIds = (currentIds: string[], nextIds: string[]): string[] => {
  return [...new Set([...currentIds, ...nextIds])];
};

const removeIds = (currentIds: string[], idsToRemove: string[]): string[] => {
  const idsToRemoveSet = new Set(idsToRemove);
  return currentIds.filter(id => !idsToRemoveSet.has(id));
};

function shouldRunIosForegroundRefresh(inactiveMs: number | null) {
  return inactiveMs === null || inactiveMs >= iosForegroundRefreshMinInactiveMs;
}

export const FollowingProvider = ({ children }: { children: ReactNode }) => {
  const [followingArtists, setFollowingArtists] = useState<ArtistMinimal[]>([]);
  const { user, getAccessToken } = useAuth();
  const { tasks, addTask, removeTask, executeTask } = useTaskManager();
  const [taskId, setTaskId] = useState<string | null>(null);
  const [isLoadingFollowing, setIsLoadingFollowing] = useState(true);
  const [hasLoadedFollowingOnce, setHasLoadedFollowingOnce] = useState(false);
  const [pendingArtistImageIds, setPendingArtistImageIds] = useState<string[]>([]);
  const [eventVersion, setEventVersion] = useState(0);
  const { artistProfileImages, setArtistProfileImages } = useCache();
  const apiClient = useApiClient(getAccessToken);
  const pendingEventUpdateRef = useRef(false);
  const artistProfileImagesRef = useRef(artistProfileImages);
  const taskIdRef = useRef<string | null>(null);
  const queuedFetchReasonRef = useRef<FollowingFetchReason | null>(null);
  const followOverridesRef = useRef<Map<string, FollowingOverride>>(new Map());
  const userId = user?.uid ?? null;

  const getTaskResult = useCallback(async <T,>(taskId: string) =>
    await apiClient.request<TaskResultResponse<T>>('getTaskResult', {
      body: { taskId },
    }), [apiClient]);

  const waitForTaskResult = useCallback(async <T,>(
    taskId: string,
    options?: Parameters<typeof apiClient.waitForTaskResult<T>>[2],
  ) => await apiClient.waitForTaskResult<T>(taskId, getTaskResult, options), [apiClient, getTaskResult]);

  const getFollowing = useCallback(async () =>
    await apiClient.request<FollowingResponse>('getFollowing', { method: 'GET' }), [apiClient]);

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

  const applyFollowOverrides = useCallback((artists: ArtistMinimal[]): ArtistMinimal[] => {
    let nextArtists = artists;

    followOverridesRef.current.forEach(override => {
      if (!override.isFollowing) {
        nextArtists = nextArtists.filter(artist => artist.id !== override.artist.id);
        return;
      }

      const existingIndex = nextArtists.findIndex(artist => artist.id === override.artist.id);
      if (existingIndex === -1) {
        nextArtists = [...nextArtists, override.artist];
        return;
      }

      nextArtists = nextArtists.map(artist =>
        artist.id === override.artist.id ? override.artist : artist
      );
    });

    followOverridesRef.current.clear();

    return nextArtists;
  }, []);

  const fetchArtists = useCallback(async (reason: FollowingFetchReason) => {
    try {
      if (!user) {
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
      const task = addTask(() => getFollowing(), 'getFollowing', {
        origin: reason,
        replayPolicy: 'both',
      });
      updateTaskId(task.id);
      void executeTask(task);
    } catch (error) {
      console.error('follow-context: queue following fetch task failed', error);
    }
  }, [addTask, executeTask, getFollowing, removeTask, updateTaskId, user]);

  const resolveFollowingArtistImages = useCallback(async (
    profileImageTaskId: string,
    artistIds: string[]
  ) => {
    await resolveNullableTaskMap({
      taskId: profileImageTaskId,
      expectedIds: artistIds,
      waitForTaskResult,
      extractMap: extractArtistProfileImages,
      onResolvedValues: (artistProfileImages, resolvedArtistIds) => {
        setArtistProfileImages(prev => mergeNullableStringMaps(prev, artistProfileImages));
        removePendingArtistImages(resolvedArtistIds);
      },
      onError: error => {
        console.error('follow-context: resolve artist profile image task failed', error);
      },
      shouldFillMissingOnCompleted: taskResult => (taskResult.subtaskCount ?? 0) === 0,
      recreateTask: async () => {
        const result = await getFollowing();
        return result.profileImageTaskId;
      },
      recreateTaskDescription: 'getFollowing.profileImageTaskId',
    });
  }, [getFollowing, removePendingArtistImages, setArtistProfileImages, waitForTaskResult]);

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
    queuedFetchReasonRef.current = null;
    setFollowingArtists([]);
    setHasLoadedFollowingOnce(false);
    setPendingArtistImageIds([]);
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

    if (Platform.OS === 'ios' && shouldRunIosForegroundRefresh(inactiveMs)) {
      void fetchArtists('foreground-resume');
    }
  });

  const refreshFollowing = useCallback(() => {
    void fetchArtists('manual-refresh');
  }, [fetchArtists]);

  const setFollowedArtist = useCallback((artist: ArtistMinimal, isFollowing: boolean) => {
    followOverridesRef.current.set(artist.id, {
      artist,
      isFollowing,
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
            profileImageTaskId?: string;
          } | undefined;
          const artists = applyFollowOverrides(result?.artists ?? []);
          setFollowingArtists(artists);
          setHasLoadedFollowingOnce(true);

          if (result?.profileImageTaskId) {
            const missingImageIds = artists
              .map(artist => artist.id)
              .filter(artistId => artistProfileImagesRef.current[artistId] === undefined);

            if (missingImageIds.length > 0) {
              setPendingArtistImageIds(prev => mergeUniqueIds(prev, missingImageIds));
              void resolveFollowingArtistImages(result.profileImageTaskId, missingImageIds);
            } else {
              setPendingArtistImageIds([]);
            }
          } else {
            setPendingArtistImageIds([]);
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
  }, [applyFollowOverrides, fetchArtists, removeTask, resolveFollowingArtistImages, taskId, tasks, updateTaskId]);

  return (
    <FollowingContext.Provider value={{
      followingArtists,
      isLoadingFollowing,
      hasLoadedFollowingOnce,
      pendingArtistImageIds,
      pendingEventUpdateRef,
      eventVersion,
      refreshFollowing,
      setFollowedArtist,
    }}>
      {children}
    </FollowingContext.Provider>
  );
};

export const useFollowing = () => useContext(FollowingContext)!;
