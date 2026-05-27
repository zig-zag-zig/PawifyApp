import React from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { NewReleaseListItem } from '../../../contexts/NewReleasesContext';
import { useScrollAnchorList } from '../../../hooks/useScrollAnchorList';
import ReleasesView from '../components/ReleasesView';
import { useReleasesPage } from '../hooks/useReleasesPage';

const ReleasesPage = () => {
    const releasesPage = useReleasesPage();
    const { flatListRef, selectionManagerRef } = useScrollAnchorList<NewReleaseListItem>(
        releasesPage.state.displayedReleases
    );

    useFocusEffect(
        React.useCallback(() => {
            return () => {
                selectionManagerRef.current?.clearSelection();
            };
        }, [selectionManagerRef])
    );

    return (
        <ReleasesView
            releases={releasesPage.state.displayedReleases}
            selectionItems={releasesPage.state.allReleases}
            pendingReleaseCoverIds={releasesPage.state.pendingReleaseCoverIds}
            isLoading={releasesPage.state.isLoading}
            hasLoadedOnce={releasesPage.state.hasLoadedOnce}
            showBanner={releasesPage.state.showBanner}
            onBannerVisibilityChanged={releasesPage.onBannerVisibilityChanged}
            onRemoveSelected={releasesPage.onRemoveSelected}
            onLoadMore={releasesPage.onLoadMore}
            onReleasePressed={releasesPage.onReleasePressed}
            flatListRef={flatListRef}
            selectionManagerRef={selectionManagerRef}
        />
    );
};

export default ReleasesPage;
