import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { GenericList } from '../../../components/GenericList';
import type { ArtistMinimal } from '../../../shared/music';
import ArtistMinimalCard from '../../../components/ArtistMinimalCard';
import { ScreenContainer } from '../../../components/ui';

interface ArtistsViewProps {
    artists: ArtistMinimal[];
    artistProfileImages: Record<string, string | null | undefined>;
    pendingArtistImageIds: string[];
    isLoading: boolean;
    hasLoadedOnce: boolean;
    showBanner: boolean;
    onBannerVisibilityChanged: (visible: boolean) => void;
    onRemoveSelected: (artistIds: string[]) => void;
    onArtistPressed: (artistId: string, isInSelectionMode: boolean, onSelect: () => void) => void;
    flatListRef: React.RefObject<FlatList<ArtistMinimal> | null>;
    selectionManagerRef: React.RefObject<{ clearSelection: () => void } | null>;
}

const ArtistsView = ({
    artists,
    artistProfileImages,
    pendingArtistImageIds,
    isLoading,
    hasLoadedOnce,
    showBanner,
    onBannerVisibilityChanged,
    onRemoveSelected,
    onArtistPressed,
    flatListRef,
    selectionManagerRef,
}: ArtistsViewProps) => {
    const shouldShowEmptyState = hasLoadedOnce && !isLoading && artists.length === 0;

    if (shouldShowEmptyState) {
        return (
            <ScreenContainer>
                <View
                    style={{
                        paddingVertical: 50,
                        paddingHorizontal: 8,
                    }}
                >
                    <Text
                        style={{
                            fontSize: 20,
                            fontWeight: '700',
                            marginBottom: 8,
                            color: '#f3f4f6',
                        }}
                    >
                        No favorite artists
                    </Text>
                </View>
            </ScreenContainer>
        );
    }

    return (
        <GenericList
            items={artists}
            isLoading={isLoading}
            onRemoveSelected={onRemoveSelected}
            renderCard={({
                item,
                isSelected,
                isInSelectionMode,
                onPress,
                onLongPress,
            }: {
                item: ArtistMinimal;
                isSelected: boolean;
                isInSelectionMode: boolean;
                onPress: () => void;
                onLongPress: () => void;
            }) => (
                <ArtistMinimalCard
                    artist={item}
                    profileImageUrl={artistProfileImages[item.id]}
                    showProfileImageSpinnerWhenMissing={pendingArtistImageIds.includes(item.id)}
                    isSelected={isSelected}
                    onPress={() => onArtistPressed(item.id, isInSelectionMode, onPress)}
                    onLongPress={onLongPress}
                />
            )}
            infoBannerMessage="The following artists list was updated."
            promptMessage="Are you sure you want to unfollow the selected artists?"
            selectionManagerRef={selectionManagerRef}
            flatListRef={flatListRef}
            bannerVisible={showBanner}
            setBannerVisible={onBannerVisibilityChanged}
            promptConfirmText="Unfollow"
        />
    );
};

export default ArtistsView;
