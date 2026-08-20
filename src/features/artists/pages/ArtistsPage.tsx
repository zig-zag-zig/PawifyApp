import React from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { ArtistMinimal } from '../../../shared/music';
import { useScrollAnchorList } from '../../../hooks/useScrollAnchorList';
import ArtistsView from '../components/ArtistsView';
import { useArtistsPage } from '../hooks/useArtistsPage';

const ArtistsPage = () => {
    const artistsPage = useArtistsPage();
    const { flatListRef, selectionManagerRef } = useScrollAnchorList<ArtistMinimal>();

    useFocusEffect(
        React.useCallback(() => {
            return () => {
                selectionManagerRef.current?.clearSelection();
            };
        }, [selectionManagerRef])
    );

    return (
        <ArtistsView
            artists={artistsPage.state.artists}
            artistProfileImages={artistsPage.state.artistProfileImages}
            pendingArtistImageIds={artistsPage.state.pendingArtistImageIds}
            isLoading={artistsPage.state.isLoading}
            hasLoadedOnce={artistsPage.state.hasLoadedOnce}
            showBanner={artistsPage.state.showBanner}
            onBannerVisibilityChanged={artistsPage.onBannerVisibilityChanged}
            onRemoveSelected={artistsPage.onRemoveSelected}
            onArtistPressed={artistsPage.onArtistPressed}
            flatListRef={flatListRef}
            selectionManagerRef={selectionManagerRef}
        />
    );
};

export default ArtistsPage;
