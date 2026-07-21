import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useToast } from '../../../contexts/ToastContext';
import { useAuth } from '../../../contexts/AuthContext';
import { useReleaseApi } from '../api/releaseApi';
import { useOnAppForeground } from '../../../hooks/useOnAppForeground';
import useTaskManager from '../../../hooks/useTaskManager';
import type { NewRelease, NewReleaseCoverTaskResult, NewReleasesResult, RemoteValueState } from '../../../shared/music';
import { EventService } from '../../../services/eventService';
import { resolveNullableTaskMap } from '../../../shared/taskResults/resolveNullableTaskMap';
import { mergeUniqueIds } from '../../../utils/arrays';
import { shouldRunForegroundRefresh } from '../../../utils/foregroundRefreshPolicy';
import { mergeNullableStringMaps } from '../../../utils/nullableMaps';
import type { NullableStringMap } from '../../../utils/nullableMaps';
import { extractNewReleaseCovers } from '../../../utils/taskResultMaps';

export type NewReleaseListItem = NewRelease & { cover_url: RemoteValueState };

export interface NewReleaseFeedContextValue {
  newReleases: NewReleaseListItem[];
  isLoading: boolean;
  hasLoadedOnce: boolean;
  pendingEventUpdateRef: React.RefObject<boolean>;
  eventVersion: number;
  pendingReleaseCoverIds: string[];
  removeNewReleases: (ids: string[]) => void;
  ensureNewReleasesLoaded: () => void;
}

type RemovedReleaseSnapshot = {
  release: NewReleaseListItem;
  index: number;
};

type NewReleaseFeedFetchReason = 'releases-initial' | 'releases-event' | 'foreground-resume';

function restoreRemovedReleases(
  currentReleases: NewReleaseListItem[],
  removedReleases: RemovedReleaseSnapshot[]
): NewReleaseListItem[] {
  if (removedReleases.length === 0) {
    return currentReleases;
  }

  const existingReleaseIds = new Set(currentReleases.map(release => release.id));
  const restoredReleases = [...currentReleases];

  removedReleases.forEach(({ release, index }) => {
    if (existingReleaseIds.has(release.id)) {
      return;
    }

    restoredReleases.splice(Math.min(index, restoredReleases.length), 0, release);
    existingReleaseIds.add(release.id);
  });

  return restoredReleases;
}

function getRemoveReleasesFailureMessage(count: number): string {
  return count === 1
    ? 'Removing new release failed.'
    : 'Removing selected new releases failed.';
}

export function useNewReleaseFeedController(): NewReleaseFeedContextValue {
  const [newReleases, setNewReleases] = useState<NewReleaseListItem[]>([]);
  const [pendingReleaseCoverIds, setPendingReleaseCoverIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const { user } = useAuth();
  const releaseApi = useReleaseApi();
  const { tasks, addTask, removeTask, executeTask } = useTaskManager();
  const [taskId, setTaskId] = useState<string | null>(null);
  const taskIdRef = useRef<string | null>(null);
  const releaseCoverTaskIdRef = useRef<string | null>(null);
  const initialLoadRequestedRef = useRef(false);
  const queuedFetchReasonRef = useRef<NewReleaseFeedFetchReason | null>(null);
  const pendingEventUpdateRef = useRef(false);
  const [eventVersion, setEventVersion] = useState(0);
  const { showToast } = useToast();

  const updateTaskId = useCallback((nextTaskId: string | null) => {
    taskIdRef.current = nextTaskId;
    setTaskId(nextTaskId);
  }, []);

  useEffect(() => {
    setNewReleases([]);
    setPendingReleaseCoverIds([]);
    setHasLoadedOnce(false);
    setIsLoading(false);
    initialLoadRequestedRef.current = false;
    queuedFetchReasonRef.current = null;
    releaseCoverTaskIdRef.current = null;

    if (taskIdRef.current) {
      removeTask(taskIdRef.current);
      updateTaskId(null);
    }
  }, [removeTask, updateTaskId, user?.uid]);

  const fetchNewReleases = useCallback((reason: NewReleaseFeedFetchReason) => {
    if (!user) {
      queuedFetchReasonRef.current = null;
      return;
    }

    if (taskIdRef.current) {
      queuedFetchReasonRef.current = reason;
      return;
    }

    setIsLoading(true);
    const task = addTask(() => releaseApi.getNewReleases(), 'getNewReleases', {
      origin: reason,
      replayPolicy: 'both',
    });
    updateTaskId(task.id);
    void executeTask(task);
  }, [addTask, executeTask, releaseApi, updateTaskId, user]);

  const getMissingCoverIds = useCallback((releases: NewReleaseListItem[]) =>
    releases
      .filter(release => release.cover_url === undefined)
      .map(release => release.id),
    []);

  const applyReleaseCovers = useCallback((covers: NullableStringMap) => {
    setNewReleases(prev => {
      const currentCovers = prev.reduce<NullableStringMap>((output, release) => {
        output[release.id] = release.cover_url;
        return output;
      }, {});
      const mergedCovers = mergeNullableStringMaps(currentCovers, covers);

      return prev.map(release => {
        const nextCover = mergedCovers[release.id];
        if (nextCover === release.cover_url) {
          return release;
        }

        return {
          ...release,
          cover_url: nextCover,
        };
      });
    });
  }, []);

  const resolveNewReleaseCovers = useCallback(async (
    releaseCoverTaskId: string,
    releaseIds: string[]
  ) => {
    releaseCoverTaskIdRef.current = releaseCoverTaskId;
    setPendingReleaseCoverIds(releaseIds);

    await resolveNullableTaskMap<NewReleaseCoverTaskResult>({
      taskId: releaseCoverTaskId,
      expectedIds: releaseIds,
      waitForTaskResult: releaseApi.waitForTaskResult,
      extractMap: extractNewReleaseCovers,
      onResolvedValues: (covers, resolvedReleaseIds) => {
        if (releaseCoverTaskIdRef.current !== releaseCoverTaskId) {
          return;
        }

        applyReleaseCovers(covers);
        setPendingReleaseCoverIds(prev =>
          prev.filter(releaseId => !resolvedReleaseIds.includes(releaseId))
        );
      },
      onError: error => {
        console.error('new-releases: resolve release cover task failed', error);
      },
      recreateTask: async () => {
        const result = await releaseApi.getNewReleases();
        return result.releaseCoverTaskId;
      },
      recreateTaskDescription: 'getNewReleases.releaseCoverTaskId',
    });
  }, [applyReleaseCovers, releaseApi]);

  useEffect(() => {
    if (!taskId) return;
    const task = tasks.find(t => t.id === taskId);
    if (task && (task.result !== undefined || task.error)) {
      if (task.error) {
        console.error('new-releases: fetch releases task failed', task.error);
        if (!hasLoadedOnce) {
          setNewReleases([]);
          setPendingReleaseCoverIds([]);
          releaseCoverTaskIdRef.current = null;
          setHasLoadedOnce(false);
          initialLoadRequestedRef.current = false;
        }
      } else {
        const result = task.result as NewReleasesResult | undefined;
        const releases = (result?.releases ?? []).map((release): NewReleaseListItem => ({
          ...release,
          cover_url: undefined,
        }));
        setNewReleases(releases);
        setHasLoadedOnce(true);
        const missingCoverIds = getMissingCoverIds(releases);
        if (result?.releaseCoverTaskId && missingCoverIds.length > 0) {
          void resolveNewReleaseCovers(result.releaseCoverTaskId, missingCoverIds);
        } else {
          releaseCoverTaskIdRef.current = null;
          setPendingReleaseCoverIds([]);
        }
      }
      removeTask(task.id);
      if (taskIdRef.current === task.id) {
        updateTaskId(null);
      }
      setIsLoading(false);

      const queuedReason = queuedFetchReasonRef.current;
      queuedFetchReasonRef.current = null;
      if (queuedReason) {
        fetchNewReleases(queuedReason);
      }
    }
  }, [
    fetchNewReleases,
    getMissingCoverIds,
    hasLoadedOnce,
    removeTask,
    resolveNewReleaseCovers,
    taskId,
    tasks,
    updateTaskId,
  ]);

  const removeNewReleases = useCallback(async (ids: string[]) => {
    if (ids.length === 0) {
      return;
    }

    const idsToRemove = new Set(ids);
    const removedReleases = newReleases.reduce<RemovedReleaseSnapshot[]>((output, release, index) => {
      if (idsToRemove.has(release.id)) {
        output.push({ release, index });
      }
      return output;
    }, []);
    const removedPendingCoverIds = pendingReleaseCoverIds.filter(id => idsToRemove.has(id));

    setNewReleases(prev => prev.filter(release => !idsToRemove.has(release.id)));
    setPendingReleaseCoverIds(prev => prev.filter(id => !idsToRemove.has(id)));
    try {
      await releaseApi.removeNewReleases(ids);
    } catch (error) {
      console.error('new-releases: remove releases failed', error);
      setNewReleases(prev => restoreRemovedReleases(prev, removedReleases));
      setPendingReleaseCoverIds(prev => mergeUniqueIds(prev, removedPendingCoverIds));
      showToast(getRemoveReleasesFailureMessage(ids.length), 'error');
    }
  }, [newReleases, pendingReleaseCoverIds, releaseApi, showToast]);

  const handleReleasesEvent = useCallback((eventName: string, options?: { force?: boolean }) => {
    if (eventName !== 'releases') {
      return false;
    }

    if (!options?.force && AppState.currentState !== 'active') {
      return true;
    }

    if (hasLoadedOnce || initialLoadRequestedRef.current) {
      pendingEventUpdateRef.current = true;
      setEventVersion(value => value + 1);
      fetchNewReleases('releases-event');
    }

    EventService.consumeEvent(eventName);
    return true;
  }, [fetchNewReleases, hasLoadedOnce]);

  useEffect(() => {
    EventService.getPendingEvents().forEach((_, eventName) => {
      handleReleasesEvent(eventName, { force: AppState.currentState === 'active' });
    });

    const unsubscribe = EventService.addListener((eventName) => {
      handleReleasesEvent(eventName);
    });

    return () => {
      unsubscribe();
    };
  }, [handleReleasesEvent]);

  useOnAppForeground(({ inactiveMs }) => {
    if (!user) {
      return;
    }

    if (EventService.getPendingEvents().has('releases')) {
      handleReleasesEvent('releases', { force: true });
      return;
    }

    if (Platform.OS === 'ios' && hasLoadedOnce && shouldRunForegroundRefresh(inactiveMs)) {
      fetchNewReleases('foreground-resume');
    }
  }, {
    enabled: !!user,
  });

  const ensureNewReleasesLoaded = useCallback(() => {
    if (!hasLoadedOnce && !initialLoadRequestedRef.current) {
      initialLoadRequestedRef.current = true;
      fetchNewReleases('releases-initial');
    }
  }, [fetchNewReleases, hasLoadedOnce]);

  return {
    newReleases,
    isLoading,
    hasLoadedOnce,
    pendingEventUpdateRef,
    eventVersion,
    pendingReleaseCoverIds,
    removeNewReleases,
    ensureNewReleasesLoaded,
  };
}
