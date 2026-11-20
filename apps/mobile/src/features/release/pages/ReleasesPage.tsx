import React from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { NewReleaseListItem } from '../state/NewReleaseFeedContext';
import { useScrollAnchorList } from '../../../hooks/useScrollAnchorList';
import ReleasesView from '../components/ReleasesView';
import { useReleasesPage } from '../hooks/useReleasesPage';
import { useReleaseNotificationNavigationPending } from '../../../hooks/useReleaseNotificationNavigationPending';
import { finishReleaseNotificationNavigation } from '../../../services/notifications/notificationNavigation';

const ReleasesPage = () => {
    const releasesPage = useReleasesPage();
    const isNotificationNavigationPending = useReleaseNotificationNavigationPending();
    const { flatListRef, selectionManagerRef } = useScrollAnchorList<NewReleaseListItem>();

    React.useEffect(() => {
        if (isNotificationNavigationPending && releasesPage.state.hasLoadedOnce) {
            finishReleaseNotificationNavigation();
        }
    }, [isNotificationNavigationPending, releasesPage.state.hasLoadedOnce]);

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
            hasMore={releasesPage.state.hasMore}
            onReleasePressed={releasesPage.onReleasePressed}
            flatListRef={flatListRef}
            selectionManagerRef={selectionManagerRef}
        />
    );
};

export default ReleasesPage;
