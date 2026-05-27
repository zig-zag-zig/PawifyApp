import { useNavigation } from '@react-navigation/native';
import { useCallback, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { useToast } from '../../../components/ToastContext';
import type { Artist, ArtistReleaseGroup } from '../../../modules/models/models';
import { getUserFacingErrorMessage } from '../../../services/userFacingErrors';
import type { ReleaseGroupReleasesResponse } from '../../../types/apiTypes';
import {
    ArtistNavigationProp,
    ReleaseGroupNavigationProp,
    ReleaseNavigationProp,
} from '../../../types/navigation';
import {
    describeError,
    describeIds,
    diagnosticLog,
    diagnosticWarn,
    elapsedSince,
} from '../../../utils/diagnostics';
import type { PendingTaskKey } from '../model/types';
import type { ArtistPageAction } from '../state/artistReducer';

type PendingTaskRef = RefObject<{
    artistTaskId: string | null;
}>;

type ArtistPageActionsOptions = {
    artistId: string | undefined;
    artist: Artist | undefined;
    isFollowing: boolean;
    isFollowLoading: boolean;
    isLoadingReleaseGroup: boolean;
    artistIdRef: RefObject<string | undefined>;
    pendingTaskRef: PendingTaskRef;
    followToggleInFlightRef: RefObject<boolean>;
    isMountedRef: RefObject<boolean>;
    dispatch: Dispatch<ArtistPageAction>;
    setOptimisticFollowing: Dispatch<SetStateAction<boolean | null>>;
    setFollowedArtist: (artist: Artist, followed: boolean) => void;
    followArtist: (artistId: string) => Promise<unknown>;
    unfollowArtist: (artistId: string) => Promise<unknown>;
    getReleaseGroupReleases: (releaseGroupId: string) => Promise<ReleaseGroupReleasesResponse>;
    removeTask: (taskId: string) => void;
    updatePendingTask: (key: PendingTaskKey, taskId: string | null) => void;
};

export function useArtistPageActions({
    artistId,
    artist,
    isFollowing,
    isFollowLoading,
    isLoadingReleaseGroup,
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
}: ArtistPageActionsOptions) {
    const { showToast } = useToast();
    const releaseNavigation = useNavigation<ReleaseNavigationProp>();
    const releaseGroupNavigation = useNavigation<ReleaseGroupNavigationProp>();
    const artistNavigation = useNavigation<ArtistNavigationProp>();

    const handleToggleFollow = useCallback(async () => {
        if (!artistId || !artist || isFollowLoading || followToggleInFlightRef.current) return;

        followToggleInFlightRef.current = true;
        const wasFollowing = isFollowing;
        const nextFollowing = !wasFollowing;

        try {
            dispatch({ type: 'followToggleStarted' });
            setOptimisticFollowing(nextFollowing);

            if (wasFollowing) {
                await unfollowArtist(artistId);
                setFollowedArtist(artist, false);
                return;
            }

            await followArtist(artist.id);
            setFollowedArtist(artist, true);
        } catch (error) {
            console.error('artist-page: follow toggle failed', error);
            showToast(`${wasFollowing ? 'Unfollowing' : 'Following'} artist ${artist.name} failed.`, 'error');
            if (isMountedRef.current) {
                setOptimisticFollowing(wasFollowing);
            }
        } finally {
            followToggleInFlightRef.current = false;
            if (isMountedRef.current) {
                dispatch({ type: 'followToggleFinished' });
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

    const handleArtistPressed = useCallback((targetArtistId: string) => {
        artistNavigation.push('Artist', { artistId: targetArtistId });

        if (pendingTaskRef.current.artistTaskId) {
            removeTask(pendingTaskRef.current.artistTaskId);
            updatePendingTask('artistTaskId', null);
        }
    }, [artistNavigation, pendingTaskRef, removeTask, updatePendingTask]);

    const handleReleaseGroupPressed = useCallback(async (releaseGroup: ArtistReleaseGroup) => {
        const resolvedArtistId = artistId?.trim() || artist?.id;
        if (!resolvedArtistId || isLoadingReleaseGroup) return;
        if (!releaseGroup?.id) {
            showToast('Could not open this release group because its id is missing.', 'error');
            return;
        }

        const loadStartedAt = Date.now();
        diagnosticLog('artist-page', 'release-group-press-start', {
            currentArtistId: artistIdRef.current,
            resolvedArtistId,
            releaseGroupId: releaseGroup.id,
            releaseGroupTitle: releaseGroup.title,
        });
        dispatch({ type: 'releaseGroupLoadStarted' });
        try {
            const releaseGroupResult = await getReleaseGroupReleases(releaseGroup.id);
            diagnosticLog('artist-page', 'release-group-press-done', {
                currentArtistId: artistIdRef.current,
                resolvedArtistId,
                releaseGroupId: releaseGroup.id,
                elapsedMs: elapsedSince(loadStartedAt),
                releaseCount: releaseGroupResult.releases.length,
                releaseIds: describeIds(releaseGroupResult.releases.map(release => release.id)),
                releaseCoverTaskId: releaseGroupResult.releaseCoverTaskId,
            });

            if (releaseGroupResult.releases.length === 0) {
                showToast('No releases were found for this release group.', 'info');
                return;
            }

            if (releaseGroupResult.releases.length === 1) {
                releaseNavigation.navigate('Release', {
                    releaseId: releaseGroupResult.releases[0].id,
                });
                return;
            }

            releaseGroupNavigation.navigate('ReleaseGroup', {
                releaseGroupId: releaseGroup.id,
                releases: releaseGroupResult.releases,
                initialReleaseCoverTaskId: releaseGroupResult.releaseCoverTaskId,
            });
        } catch (error) {
            console.error('artist-page: fetch release-group releases failed', error);
            diagnosticWarn('artist-page', 'release-group-press-error', {
                currentArtistId: artistIdRef.current,
                resolvedArtistId,
                releaseGroupId: releaseGroup.id,
                elapsedMs: elapsedSince(loadStartedAt),
                error: describeError(error),
            });
            showToast(
                getUserFacingErrorMessage(error, 'Failed to load releases for this group.'),
                'error'
            );
        } finally {
            dispatch({ type: 'releaseGroupLoadFinished' });
        }
    }, [
        artist?.id,
        artistId,
        artistIdRef,
        dispatch,
        getReleaseGroupReleases,
        isLoadingReleaseGroup,
        releaseGroupNavigation,
        releaseNavigation,
        showToast,
    ]);

    return {
        handleArtistPressed,
        handleReleaseGroupPressed,
        handleToggleFollow,
    };
}
