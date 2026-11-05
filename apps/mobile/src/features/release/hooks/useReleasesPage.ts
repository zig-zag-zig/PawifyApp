import { useNavigation } from '@react-navigation/native';
import { useEffect, useMemo, useReducer, useState } from 'react';
import type { NewReleaseListItem } from '../state/NewReleaseFeedContext';
import { useAuth } from '../../../contexts/AuthContext';
import { useNewReleaseFeed } from '../state/NewReleaseFeedContext';
import { useEventDrivenBanner } from '../../../hooks/useEventDrivenBanner';
import { ReleaseNavigationProp } from '../../../types/navigation';
import {
    canLoadMoreReleases,
    paginateReleases,
    RELEASES_PAGE_SIZE
} from '../domain/paginateReleases';
import type { ReleasesPageController, ReleasesPageUiState } from '../model/types';
import { createInitialReleasesState, releasesReducer } from '../state/releasesReducer';

export function useReleasesPage(): ReleasesPageController {
    const navigation = useNavigation<ReleaseNavigationProp>();
    const { user } = useAuth();
    const {
        newReleases,
        isLoading,
        hasLoadedOnce,
        removeNewReleases,
        ensureNewReleasesLoaded,
        pendingEventUpdateRef,
        eventVersion,
        pendingReleaseCoverIds,
        requestReleaseCovers,
    } = useNewReleaseFeed();
    const [showBanner, setShowBanner] = useEventDrivenBanner(pendingEventUpdateRef, eventVersion);
    const [hasRequestedInitialLoad, setHasRequestedInitialLoad] = useState(false);
    const [state, dispatch] = useReducer(
        releasesReducer,
        undefined,
        createInitialReleasesState
    );

    useEffect(() => {
        setHasRequestedInitialLoad(true);
        ensureNewReleasesLoaded();
    }, [ensureNewReleasesLoaded]);

    useEffect(() => {
        if (!user) {
            dispatch({ type: 'pageReset' });
        }
    }, [user]);

    const displayedReleases = useMemo(() => {
        return paginateReleases(newReleases, state.page, RELEASES_PAGE_SIZE);
    }, [newReleases, state.page]);

    // Covers are requested for the visible page only; the controller dedupes, so
    // scrolling back does not re-fetch.
    useEffect(() => {
        if (displayedReleases.length === 0) {
            return;
        }
        void requestReleaseCovers(displayedReleases.map(release => release.id));
    }, [displayedReleases, requestReleaseCovers]);

    const uiState: ReleasesPageUiState = {
        displayedReleases,
        allReleases: newReleases,
        pendingReleaseCoverIds,
        isLoading: isLoading || (!hasLoadedOnce && !hasRequestedInitialLoad),
        hasLoadedOnce,
        showBanner,
    };

    return {
        state: uiState,
        onLoadMore: () => {
            if (!canLoadMoreReleases(newReleases, state.page, RELEASES_PAGE_SIZE)) {
                return;
            }

            dispatch({ type: 'pageIncreased' });
        },
        onRemoveSelected: removeNewReleases,
        onReleasePressed: (release: NewReleaseListItem, isInSelectionMode: boolean, onSelect: () => void) => {
            if (isInSelectionMode) {
                onSelect();
                return;
            }

            navigation.navigate('Release', { releaseId: release.id });
        },
        onBannerVisibilityChanged: setShowBanner,
    };
}
