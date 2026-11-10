import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { GenericList } from '../../../components/GenericList';
import { InlineLink, ScreenContainer } from '../../../components/ui';
import type { NewReleaseListItem } from '../state/NewReleaseFeedContext';
import ReleaseItem from './ReleaseItem';

interface ReleasesViewProps {
    releases: NewReleaseListItem[];
    selectionItems: NewReleaseListItem[];
    pendingReleaseCoverIds: string[];
    isLoading: boolean;
    hasLoadedOnce: boolean;
    showBanner: boolean;
    onBannerVisibilityChanged: (visible: boolean) => void;
    onRemoveSelected: (releaseIds: string[]) => void;
    onLoadMore: () => void;
    hasMore: boolean;
    onReleasePressed: (release: NewReleaseListItem, isInSelectionMode: boolean, onSelect: () => void) => void;
    flatListRef: React.RefObject<FlatList<NewReleaseListItem> | null>;
    selectionManagerRef: React.RefObject<{ clearSelection: () => void } | null>;
}

const ReleasesView = ({
    releases,
    selectionItems,
    pendingReleaseCoverIds,
    isLoading,
    hasLoadedOnce,
    showBanner,
    onBannerVisibilityChanged,
    onRemoveSelected,
    onLoadMore,
    hasMore,
    onReleasePressed,
    flatListRef,
    selectionManagerRef,
}: ReleasesViewProps) => {
    const pendingReleaseCoverIdSet = React.useMemo(
        () => new Set(pendingReleaseCoverIds),
        [pendingReleaseCoverIds]
    );
    const shouldShowEmptyState = hasLoadedOnce && !isLoading && releases.length === 0;

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
                        No new releases
                    </Text>
                </View>
            </ScreenContainer>
        );
    }

    return (
        <GenericList
            items={releases}
            selectionItems={selectionItems}
            isLoading={isLoading}
            bannerVisible={showBanner}
            setBannerVisible={onBannerVisibilityChanged}
            onRemoveSelected={onRemoveSelected}
            renderCard={({
                item,
                isSelected,
                isInSelectionMode,
                onPress,
                onLongPress,
            }: {
                item: NewReleaseListItem;
                isSelected: boolean;
                isInSelectionMode: boolean;
                onPress: () => void;
                onLongPress: () => void;
            }) => (
                <ReleaseItem
                    release={item}
                    isSelected={isSelected}
                    isCoverLoading={
                        pendingReleaseCoverIdSet.has(item.id) || item.cover_url === undefined
                    }
                    onPress={() => onReleasePressed(item, isInSelectionMode, onPress)}
                    onLongPress={onLongPress}
                />
            )}
            infoBannerMessage="The new releases list was updated."
            promptMessage="Are you sure you want to remove the selected releases?"
            selectionManagerRef={selectionManagerRef}
            flatListRef={flatListRef}
            initialNumToRender={10}
            windowSize={10}
            footer={
                hasMore ? (
                    <InlineLink onPress={onLoadMore}>Load more</InlineLink>
                ) : null
            }
            promptConfirmText="Remove"
        />
    );
};

export default ReleasesView;
