import { useNavigation } from '@react-navigation/native';
import { useEffect, useMemo, useReducer, useRef } from 'react';
import { useToast } from '../../../components/ToastContext';
import { useCache } from '../../../contexts/CacheContext';
import { useFollowing } from '../state/FollowingContext';
import { useEventDrivenBanner } from '../../../hooks/useEventDrivenBanner';
import { ArtistNavigationProp } from '../../../types/navigation';
import { useArtistsApi } from '../api/artistsApi';
import { sortArtistsByDisplayName } from '../domain/sortArtists';
import type { ArtistsPageController, ArtistsPageUiState } from '../model/types';
import { artistsReducer, createInitialArtistsState } from '../state/artistsReducer';

function getRemoveArtistsFailureMessage(artistNames: string[]): string {
    return artistNames.length === 1
        ? `Removing artist ${artistNames[0]} failed.`
        : 'Removing selected artists failed.';
}

export function useArtistsPage(): ArtistsPageController {
    const navigation = useNavigation<ArtistNavigationProp>();
    const {
        followingArtists,
        isLoadingFollowing,
        hasLoadedFollowingOnce,
        pendingArtistImageIds,
        pendingEventUpdateRef,
        eventVersion,
        setFollowedArtist,
    } = useFollowing();
    const { artistProfileImages } = useCache();
    const [showBanner, setShowBanner] = useEventDrivenBanner(pendingEventUpdateRef, eventVersion);
    const { unfollowArtists } = useArtistsApi();
    const { showToast } = useToast();
    const isRemovingRef = useRef(false);

    const [state, dispatch] = useReducer(
        artistsReducer,
        undefined,
        createInitialArtistsState
    );

    const sortedArtists = useMemo(() => {
        return sortArtistsByDisplayName(followingArtists);
    }, [followingArtists]);

    useEffect(() => {
        dispatch({
            type: 'artistsLoaded',
            artists: sortedArtists,
        });
    }, [sortedArtists]);

    useEffect(() => {
        dispatch({
            type: 'loadingChanged',
            isLoading: isLoadingFollowing,
        });
    }, [isLoadingFollowing]);

    const onRemoveSelected = (artistIds: string[]) => {
        if (isRemovingRef.current) {
            return;
        }

        isRemovingRef.current = true;
        const artistIdsToRemove = new Set(artistIds);
        const removedArtists = followingArtists.filter(artist => artistIdsToRemove.has(artist.id));
        removedArtists.forEach(artist => setFollowedArtist(artist, false));

        void (async () => {
            try {
                await unfollowArtists(artistIds);
            } catch (error) {
                console.error('artists-page: unfollow artists failed', error);
                removedArtists.forEach(artist => setFollowedArtist(artist, true));
                showToast(getRemoveArtistsFailureMessage(removedArtists.map(artist => artist.name)), 'error');
            } finally {
                isRemovingRef.current = false;
            }
        })();
    };

    const onArtistPressed = (artistId: string, isInSelectionMode: boolean, onSelect: () => void) => {
        if (isInSelectionMode) {
            onSelect();
            return;
        }

        navigation.navigate('Artist', { artistId });
    };

    const uiState: ArtistsPageUiState = {
        artists: state.artists,
        artistProfileImages,
        pendingArtistImageIds,
        isLoading: state.isLoading && state.artists.length === 0,
        hasLoadedOnce: hasLoadedFollowingOnce,
        showBanner,
    };

    return {
        state: uiState,
        onArtistPressed,
        onRemoveSelected,
        onBannerVisibilityChanged: setShowBanner,
    };
}
