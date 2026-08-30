import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useCallback, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { InteractionManager } from 'react-native';
import { useToast } from '../../../contexts/ToastContext';
import type { Artist, ArtistReleaseGroup } from '@pawify/shared';
import { getUserFacingErrorMessage } from '../../../services/userFacingErrors';
import type { ReleaseGroupReleasesResponse } from '../../../types/apiTypes';
// Intentional cross-feature shared domain import (release normalization used by artist page).
import { normalizeReleaseGroupReleasesResponse } from '../../release/domain/releaseGroupReleases';
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

const NAVIGATION_HANDOFF_FALLBACK_MS = 600;
const RELEASE_GROUP_RESPONSE_RETRY_DELAYS_MS = [250, 750];

function wait(milliseconds: number): Promise<void> {
    return new Promise(resolve => {
        setTimeout(resolve, milliseconds);
    });
}

async function getReleaseGroupReleasesWhenReady(
    getReleaseGroupReleases: (releaseGroupId: string) => Promise<ReleaseGroupReleasesResponse>,
    releaseGroupId: string,
): Promise<ReleaseGroupReleasesResponse> {
    for (let attempt = 0; attempt <= RELEASE_GROUP_RESPONSE_RETRY_DELAYS_MS.length; attempt += 1) {
        if (attempt > 0) {
            await wait(RELEASE_GROUP_RESPONSE_RETRY_DELAYS_MS[attempt - 1]);
        }

        const response = await getReleaseGroupReleases(releaseGroupId);
        const normalizedResponse = normalizeReleaseGroupReleasesResponse(response);

        if (normalizedResponse) {
            return normalizedResponse;
        }
    }

    throw new Error('Please wait a moment and try again.');
}

function createNavigationHandoffWaiter(
    navigation: ReleaseGroupNavigationProp
): () => Promise<void> {
    const waitForHandoff = new Promise<void>(resolve => {
        let didResolve = false;
        let unsubscribeTransitionEnd: (() => void) | undefined;
        let frameId: number | null = null;

        const finishAfterPaint = () => {
            if (didResolve) {
                return;
            }

            didResolve = true;
            unsubscribeTransitionEnd?.();

            if (frameId !== null) {
                cancelAnimationFrame(frameId);
            }

            InteractionManager.runAfterInteractions(() => {
                frameId = requestAnimationFrame(() => {
                    frameId = requestAnimationFrame(() => {
                        frameId = null;
                        resolve();
                    });
                });
            });
        };

        const fallbackTimeout = setTimeout(finishAfterPaint, NAVIGATION_HANDOFF_FALLBACK_MS);

        unsubscribeTransitionEnd = navigation.addListener('transitionEnd', event => {
            if (event.data?.closing) {
                return;
            }

            clearTimeout(fallbackTimeout);
            finishAfterPaint();
        });
    });

    return () => waitForHandoff;
}

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

    useFocusEffect(
        useCallback(() => {
            dispatch({ type: 'releaseGroupLoadFinished' });
        }, [dispatch])
    );

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
        let didNavigate = false;
        let waitForHandoff: (() => Promise<void>) | null = null;

        try {
            const releaseGroupResult = await getReleaseGroupReleasesWhenReady(
                getReleaseGroupReleases,
                releaseGroup.id
            );
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
                didNavigate = true;
                return;
            }

            waitForHandoff = createNavigationHandoffWaiter(releaseGroupNavigation);
            releaseGroupNavigation.navigate('ReleaseGroup', {
                releaseGroupId: releaseGroup.id,
                releases: releaseGroupResult.releases,
                initialReleaseCoverTaskId: releaseGroupResult.releaseCoverTaskId,
                initialReleaseCovers: releaseGroupResult.releaseCovers,
            });
            didNavigate = true;
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
            if (didNavigate && waitForHandoff) {
                await waitForHandoff();
            }

            if (isMountedRef.current) {
                dispatch({ type: 'releaseGroupLoadFinished' });
            }
        }
    }, [
        artist?.id,
        artistId,
        artistIdRef,
        dispatch,
        getReleaseGroupReleases,
        isMountedRef,
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
