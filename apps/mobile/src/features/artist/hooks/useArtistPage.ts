import { RouteProp, useRoute } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useCache } from '../../../contexts/CacheContext';
import { useFollowing } from '../../artists/state/FollowingContext';
import useTaskManager from '../../../hooks/useTaskManager';
import { RootStackParamList } from '../../../types/navigation';
import { useArtistApi } from '../api/artistApi';
import { buildReleaseSections, DEFAULT_RELEASE_ITEMS_TO_SHOW } from '../domain/releaseSections';
import type { ArtistPageController, ArtistPageUiState, PendingTaskKey } from '../model/types';
import { artistReducer, createInitialArtistPageState } from '../state/artistReducer';
import { useArtistPageDataTasks } from './useArtistPageDataTasks';
import { useArtistPageCacheMergers } from './useArtistPageCacheMergers';
import { useArtistPageDiagnostics } from './useArtistPageDiagnostics';
import { useArtistPageActions } from './useArtistPageActions';
import { useArtistRelationshipImageTasks } from './useArtistRelationshipImageTasks';
import { useArtistPageTaskResolvers } from './useArtistPageTaskResolvers';
import { diagnosticWarn, describeError } from '../../../utils/diagnostics';
import { normalizeNullableStringMap } from '../../../utils/nullableMaps';
import { getIdsMissingFromValues } from '../../../utils/nullableMaps';

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
        waitForTaskResultById
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
        waitForTaskResult: waitForTaskResultById,
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
        mergeProfileImagesWithDiagnostics,
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
        mergeProfileImagesWithDiagnostics,
        mergeReleaseGroupCoversWithDiagnostics,
        setOptimisticFollowing,
        taskStartedAtRef,
        tasks,
        updatePendingTask,
    });

    /**
     * Reveals more rows in a section, fetching the next server page when the
     * already-loaded groups run out.
     *
     * The catalog is paged with a keyset cursor, so "show more" costs one page of
     * work instead of re-walking every release group.
     */
    const handleLoadMoreReleases = useCallback(
        (sectionTitle: string) => {
            const loadedForSection = state.allReleaseGroups.filter(
                group => (group['primary-type'] ?? 'Other') === sectionTitle,
            ).length;
            const visibleForSection =
                state.loadedItemsByType[sectionTitle] ?? DEFAULT_RELEASE_ITEMS_TO_SHOW;

            const canRevealLocally =
                visibleForSection < loadedForSection || !state.hasMoreReleaseGroups;

            dispatch({
                type: 'releaseSectionLoadMore',
                sectionTitle,
            });

            if (canRevealLocally || state.isLoadingMoreReleases) {
                return;
            }

            void (async () => {
                dispatch({ type: 'releasesMoreStarted' });
                try {
                    const page = await getArtistReleases(artistId, {
                        cursor: state.releaseGroupsNextCursor,
                    });
                    const releaseGroups = page.releaseGroups ?? [];

                    mergeReleaseGroupCoversWithDiagnostics(
                        normalizeNullableStringMap(page.releaseGroupCovers),
                        releaseGroups.map(group => group.id),
                        'artist-releases-more',
                    );

                    dispatch({
                        type: 'releasesMoreSucceeded',
                        releaseGroups,
                        nextCursor: page.nextCursor ?? null,
                        hasMore: page.hasMore ?? false,
                    });

                    const pendingIds = page.releaseGroupCoverTaskId
                        ? getIdsMissingFromValues(
                              releaseGroups.map(group => group.id),
                              releaseGroupCovers,
                          )
                        : [];
                    if (pendingIds.length > 0) {
                        dispatch({
                            type: 'releaseGroupCoverLoadQueued',
                            releaseGroupIds: pendingIds,
                        });
                        void resolveReleaseGroupCoverTask(page.releaseGroupCoverTaskId, pendingIds);
                    }
                } catch (error) {
                    diagnosticWarn('artist-page', 'artist-releases-more-error', {
                        artistId: artistIdRef.current,
                        error: describeError(error),
                    });
                    dispatch({ type: 'releasesMoreFailed' });
                }
            })();
        },
        [
            artistId,
            artistIdRef,
            dispatch,
            getArtistReleases,
            mergeReleaseGroupCoversWithDiagnostics,
            releaseGroupCovers,
            resolveReleaseGroupCoverTask,
            state.allReleaseGroups,
            state.hasMoreReleaseGroups,
            state.isLoadingMoreReleases,
            state.loadedItemsByType,
            state.releaseGroupsNextCursor,
        ],
    );

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
