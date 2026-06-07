import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { ScreenContainer } from '../../../components/ui';
import { useGlobalSpinner } from '../../../contexts/GlobalSpinnerContext';
import { useContentReady } from '../../../hooks/useContentReady';
import type { ArtistReleaseGroup } from '../../../shared/music';
import type { ArtistPageUiState } from '../model/types';
import ArtistHeader from './ArtistHeader';
import ReleasesSection from './ReleasesSection';

interface ArtistViewProps {
    state: ArtistPageUiState;
    onToggleFollow: () => void;
    onArtistPressed: (artistId: string) => void;
    onRelationshipsExpanded: (artistIds: string[]) => void;
    onReleaseGroupPressed: (releaseGroup: ArtistReleaseGroup) => Promise<void>;
    onLoadMoreReleases: (sectionTitle: string) => void;
    onRetry: () => void;
    onClearError: () => void;
}

const ArtistView = ({
    state,
    onToggleFollow,
    onArtistPressed,
    onRelationshipsExpanded,
    onReleaseGroupPressed,
    onLoadMoreReleases,
    onRetry,
    onClearError
}: ArtistViewProps) => {
    const isLoadingPrimaryContent = state.isLoadingArtist || state.isLoadingReleases;
    const { isWaitingForContent, onContentReady } = useContentReady(
        isLoadingPrimaryContent,
        !!state.artist && !isLoadingPrimaryContent
    );
    useGlobalSpinner(state.isLoadingReleaseGroup || isLoadingPrimaryContent || isWaitingForContent);
    const artistHeader = React.useMemo(() => {
        if (!state.artist) {
            return null;
        }

        return (
            <ArtistHeader
                artist={state.artist}
                isLoadingArtist={state.isLoadingArtist}
                isFollowLoading={state.isFollowLoading}
                isFollowDisabled={state.isFollowDisabled}
                isFollowing={state.isFollowing}
                onToggleFollow={onToggleFollow}
                profilePictures={state.profilePictures}
                pendingArtistImageIds={state.pendingArtistImageIds}
                onArtistPressed={onArtistPressed}
                onRelationshipsExpanded={onRelationshipsExpanded}
            />
        );
    }, [
        onArtistPressed,
        onRelationshipsExpanded,
        onToggleFollow,
        state.artist,
        state.isFollowDisabled,
        state.isFollowLoading,
        state.isFollowing,
        state.isLoadingArtist,
        state.pendingArtistImageIds,
        state.profilePictures,
    ]);

    return (
        <ScreenContainer>
            {state.error && (
                <View
                    style={{
                        paddingHorizontal: 16,
                        paddingVertical: 12,
                        borderRadius: 8,
                        marginHorizontal: 12,
                        marginTop: 12,
                        backgroundColor: '#fbe9e9',
                        borderColor: '#d23636',
                        borderWidth: 1,
                    }}
                >
                    <Text style={{ color: '#991b1b', marginBottom: 8 }}>{state.error}</Text>
                    <View style={{ flexDirection: 'row' }}>
                        <TouchableOpacity onPress={onRetry} style={{ marginRight: 12 }}>
                            <Text style={{ color: '#1f2937', fontWeight: '600' }}>Retry</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={onClearError}>
                            <Text style={{ color: '#6b7280' }}>Dismiss</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {state.artist && (
                <ReleasesSection
                    ListHeaderComponent={artistHeader}
                    releaseSections={state.releaseSections}
                    releaseGroupCovers={state.releaseGroupCovers}
                    pendingReleaseGroupCoverIds={state.pendingReleaseGroupCoverIds}
                    loadedItemsByType={state.loadedItemsByType}
                    isLoadingReleases={state.isLoadingReleases}
                    isLoadingReleaseGroup={state.isLoadingReleaseGroup}
                    onReleaseGroupPressed={onReleaseGroupPressed}
                    onLoadMore={onLoadMoreReleases}
                    onContentReady={onContentReady}
                />
            )}
        </ScreenContainer>
    );
};

export default ArtistView;
