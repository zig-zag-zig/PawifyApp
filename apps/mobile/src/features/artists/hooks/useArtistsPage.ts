import { useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useToast } from '../../../contexts/ToastContext';
import { useCache } from '../../../contexts/CacheContext';
import { useFollowing } from '../state/FollowingContext';
import { useEventDrivenBanner } from '../../../hooks/useEventDrivenBanner';
import { ArtistNavigationProp } from '../../../types/navigation';
import { useArtistsApi } from '../api/artistsApi';
import { sortArtistsByDisplayName } from '../domain/sortArtists';
import type { ArtistsPageController, ArtistsPageUiState } from '../model/types';
import { artistsReducer, createInitialArtistsState } from '../state/artistsReducer';

/** Rows revealed per "Load more", and the unit artwork is requested for. */
const ARTISTS_PAGE_SIZE = 10;

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
        requestArtistImages,
    } = useFollowing();
    const { artistProfileImages } = useCache();
    const [showBanner, setShowBanner] = useEventDrivenBanner(pendingEventUpdateRef, eventVersion);
    const { unfollowArtists } = useArtistsApi();
    const { showToast } = useToast();
    const isRemovingRef = useRef(false);
    // Client-side paging: the feed is fetched whole, but only a page is rendered and
    // only the rendered page asks for artwork.
    const [page, setPage] = useState(1);

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
        setPage(1);
    }, [sortedArtists]);

    const pageSize = ARTISTS_PAGE_SIZE;
    const visibleArtists = useMemo(
        () => state.artists.slice(0, page * pageSize),
        [state.artists, page, pageSize]
    );
    const hasMoreArtists = visibleArtists.length < state.artists.length;

    const onLoadMoreArtists = useCallback(() => {
        if (!hasMoreArtists) {
            return;
        }
        setPage(current => current + 1);
    }, [hasMoreArtists]);

    // Ask for artwork for what is on screen (plus the page just revealed). The
    // controller dedupes, so re-running this on every render is harmless.
    useEffect(() => {
        if (visibleArtists.length === 0) {
            return;
        }
        void requestArtistImages(visibleArtists.map(artist => artist.id));
    }, [requestArtistImages, visibleArtists]);

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
        visibleArtists,
        hasMoreArtists,
        onLoadMoreArtists,
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
