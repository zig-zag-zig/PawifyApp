import { RouteProp, useRoute } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useCache } from '../../../contexts/CacheContext';
import { useFollowing } from '../../artists/state/FollowingContext';
import useTaskManager from '../../../hooks/useTaskManager';
import { RootStackParamList } from '../../../types/navigation';
import { useArtistApi } from '../api/artistApi';
import { buildReleaseSections } from '../domain/releaseSections';
import type { ArtistPageController, ArtistPageUiState, PendingTaskKey } from '../model/types';
import { artistReducer, createInitialArtistPageState } from '../state/artistReducer';
import { useArtistPageDataTasks } from './useArtistPageDataTasks';
import { useArtistPageCacheMergers } from './useArtistPageCacheMergers';
import { useArtistPageDiagnostics } from './useArtistPageDiagnostics';
import { useArtistPageActions } from './useArtistPageActions';
import { useArtistRelationshipImageTasks } from './useArtistRelationshipImageTasks';
import { useArtistPageTaskResolvers } from './useArtistPageTaskResolvers';

type ArtistRouteProp = RouteProp<RootStackParamList, 'Artist'>;

export function useArtistPage(): ArtistPageController {
    const route = useRoute<ArtistRouteProp>();
    const { artistId } = route.params || {};

    const { followingArtists, setFollowedArtist } = useFollowing();
    const {
        artistProfileImages,
        setArtistProfileImages,
        releaseGroupCovers,
        setReleaseGroupCovers
    } = useCache();
    const { tasks, addTask, removeTask, executeTask, removeAllTasks } = useTaskManager();
    const {
        followArtist,
        unfollowArtist,
        getArtistDetails,
        getArtistReleases,
        getReleaseGroupReleases,
        waitForTaskResult
    } = useArtistApi();

    const [state, dispatch] = useReducer(
        artistReducer,
        undefined,
        createInitialArtistPageState
    );
    const [optimisticFollowing, setOptimisticFollowing] = useState<boolean | null>(null);
    const pendingTaskRef = useRef(state.pendingTasks);
    const artistProfileImagesRef = useRef(artistProfileImages);
    const artistIdRef = useRef(artistId);
    const queuedMemberImageIdsRef = useRef<Set<string>>(new Set());
    const resolvingMemberTaskIdsRef = useRef<Set<string>>(new Set());
    const resolvingSettledTaskIdsRef = useRef<Set<string>>(new Set());
    const taskStartedAtRef = useRef<Record<string, number>>({});
    const followToggleInFlightRef = useRef(false);
    const isMountedRef = useRef(true);

    useEffect(() => {
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        artistProfileImagesRef.current = artistProfileImages;
    }, [artistProfileImages]);

    useEffect(() => {
        const taskIds = new Set(tasks.map(task => task.id));
        resolvingMemberTaskIdsRef.current.forEach(taskId => {
            if (!taskIds.has(taskId)) {
                resolvingMemberTaskIdsRef.current.delete(taskId);
            }
        });
        resolvingSettledTaskIdsRef.current.forEach(taskId => {
            if (!taskIds.has(taskId)) {
                resolvingSettledTaskIdsRef.current.delete(taskId);
            }
        });
    }, [tasks]);

    useArtistPageDiagnostics({
        artistId,
        artistIdRef,
        queuedMemberImageIdsRef,
        pendingArtistImageIds: state.pendingArtistImageIds,
        pendingReleaseGroupCoverIds: state.pendingReleaseGroupCoverIds,
        membersWithoutCachedPicture: state.membersWithoutCachedPicture,
    });

    const {
        mergeProfileImagesWithDiagnostics,
        mergeReleaseGroupCoversWithDiagnostics,
    } = useArtistPageCacheMergers({
        artistIdRef,
        setArtistProfileImages,
        setReleaseGroupCovers,
    });

    const {
        resolveArtistProfileImageTask,
        resolveReleaseGroupCoverTask,
    } = useArtistPageTaskResolvers({
        artistIdRef,
        waitForTaskResult,
        mergeProfileImagesWithDiagnostics,
        mergeReleaseGroupCoversWithDiagnostics,
    });

    const updatePendingTask = useCallback((key: PendingTaskKey, taskId: string | null) => {
        pendingTaskRef.current = {
            ...pendingTaskRef.current,
            [key]: taskId,
        };

        dispatch({
            type: 'pendingTaskUpdated',
            key,
            taskId,
        });
    }, []);

    const serverIsFollowing = useMemo(() => {
        return followingArtists.some(artist => artist.id === artistId);
    }, [followingArtists, artistId]);
    const isFollowing = optimisticFollowing ?? serverIsFollowing;

    useEffect(() => {
        if (optimisticFollowing !== null && optimisticFollowing === serverIsFollowing) {
            setOptimisticFollowing(null);
        }
    }, [optimisticFollowing, serverIsFollowing]);

    const {
        handleArtistPressed,
        handleReleaseGroupPressed,
        handleToggleFollow,
    } = useArtistPageActions({
        artistId,
        artist: state.artist,
        isFollowing,
        isFollowLoading: state.isFollowLoading,
        isLoadingReleaseGroup: state.isLoadingReleaseGroup,
        artistIdRef,
        pendingTaskRef,
        followToggleInFlightRef,
        isMountedRef,
        dispatch,
        setOptimisticFollowing,
        setFollowedArtist,
        followArtist,
        unfollowArtist,
        getReleaseGroupReleases,
        removeTask,
        updatePendingTask,
    });

    const {
        handleRelationshipsExpanded,
    } = useArtistRelationshipImageTasks({
        addTask,
        artistIdRef,
        artistProfileImagesRef,
        dispatch,
        executeTask,
        getArtistDetails,
        isMountedRef,
        membersWithoutCachedPicture: state.membersWithoutCachedPicture,
        queuedMemberImageIdsRef,
        removeTask,
        resolvingMemberTaskIdsRef,
        resolveArtistProfileImageTask,
        taskStartedAtRef,
        tasks,
    });

    const {
        loadArtistData,
        loadReleasesData,
    } = useArtistPageDataTasks({
        addTask,
        artistId,
        artistIdRef,
        artistProfileImages,
        dispatch,
        executeTask,
        getArtistDetails,
        getArtistReleases,
        pendingTaskRef,
        queuedMemberImageIdsRef,
        releaseGroupCovers,
        releasesTaskId: state.pendingTasks.releasesTaskId,
        artistTaskId: state.pendingTasks.artistTaskId,
        removeAllTasks,
        removeTask,
        resolvingMemberTaskIdsRef,
        resolvingSettledTaskIdsRef,
        resolveArtistProfileImageTask,
        resolveReleaseGroupCoverTask,
        setOptimisticFollowing,
        taskStartedAtRef,
        tasks,
        updatePendingTask,
    });

    const handleLoadMoreReleases = useCallback((sectionTitle: string) => {
        dispatch({
            type: 'releaseSectionLoadMore',
            sectionTitle,
        });
    }, []);

    const releaseSections = useMemo(() => {
        return buildReleaseSections(state.allReleaseGroups);
    }, [state.allReleaseGroups]);

    const uiState: ArtistPageUiState = {
        artist: state.artist,
        error: state.error,
        isFollowing,
        isFollowDisabled: false,
        isLoadingArtist: state.isLoadingArtist,
        isLoadingReleases: state.isLoadingReleases,
        isLoadingReleaseGroup: state.isLoadingReleaseGroup,
        isFollowLoading: state.isFollowLoading,
        allReleaseGroups: state.allReleaseGroups,
        releaseGroupCovers,
        releaseSections,
        loadedItemsByType: state.loadedItemsByType,
        profilePictures: artistProfileImages,
        pendingArtistImageIds: state.pendingArtistImageIds,
        pendingReleaseGroupCoverIds: state.pendingReleaseGroupCoverIds,
    };

    return {
        state: uiState,
        onToggleFollow: handleToggleFollow,
        onArtistPressed: handleArtistPressed,
        onRelationshipsExpanded: handleRelationshipsExpanded,
        onReleaseGroupPressed: handleReleaseGroupPressed,
        onLoadMoreReleases: handleLoadMoreReleases,
        onRetry: () => {
            loadArtistData();
            loadReleasesData();
        },
        onClearError: () => dispatch({ type: 'errorCleared' }),
    };
}
