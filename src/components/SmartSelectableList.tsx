import React, { useImperativeHandle } from 'react';
import { Animated, FlatList } from 'react-native';
import { useAnimatedDelete } from '../hooks/useAnimatedDelete';
import { useSelectionManager } from '../hooks/useSelectionManager';
import AnimatedActionBar from './AnimatedActionBar';

export type SelectableCardRenderProps<T extends { id: string }> = {
    item: T;
    isSelected: boolean;
    isInSelectionMode: boolean;
    onPress: () => void;
    onLongPress: () => void;
    animValue: Animated.Value;
};

type SmartSelectableListProps<T extends { id: string }> = {
    items: T[];
    selectionItems?: T[];
    onRemoveSelected: (ids: string[]) => void;
    renderCard: (props: SelectableCardRenderProps<T>) => React.ReactNode;
    selectionManagerRef: React.RefObject<{ clearSelection: () => void } | null>;
    flatListRef: React.RefObject<FlatList<T> | null>;
    onEndReached?: () => void;
    onEndReachedThreshold?: number;
    initialNumToRender?: number;
    windowSize?: number;
    onContentReady: () => void;
};

/**
 * Selection-mode list: selection state + action bar + animated removal in one
 * component (merged from SelectableListManager + SelectableAnimatedList,
 * which had no other consumers).
 */
export function SmartSelectableList<T extends { id: string }>(
    {
        items,
        selectionItems,
        onRemoveSelected,
        renderCard,
        selectionManagerRef,
        flatListRef,
        onEndReached,
        onEndReachedThreshold,
        initialNumToRender,
        windowSize,
        onContentReady,
    }: SmartSelectableListProps<T>
) {
    const {
        selectedIds,
        toggleSelect,
        clearSelection,
        selectAll,
    } = useSelectionManager(selectionItems ?? items);
    const {
        animationRefs,
        handleRemoveSelected,
    } = useAnimatedDelete(items, onRemoveSelected);

    useImperativeHandle(selectionManagerRef, () => ({
        clearSelection,
    }));

    const removeSelected = () => {
        handleRemoveSelected(new Set(selectedIds), clearSelection);
    };

    const isInSelectionMode = selectedIds.size > 0;

    return (
        <>
            <AnimatedActionBar
                selectedCount={selectedIds.size}
                onSelectAll={selectAll}
                onDelete={removeSelected}
                onCancel={clearSelection}
                visible={selectedIds.size > 0}
            />
            <FlatList
                ref={flatListRef}
                data={items}
                renderItem={({ item }) => {
                    const animValue = animationRefs.current[item.id] || new Animated.Value(1);
                    animationRefs.current[item.id] = animValue;
                    return renderCard({
                        item,
                        isSelected: selectedIds.has(item.id),
                        isInSelectionMode,
                        onPress: () => toggleSelect(item.id),
                        onLongPress: () => toggleSelect(item.id),
                        animValue,
                    }) as React.ReactElement;
                }}
                onEndReached={onEndReached}
                onEndReachedThreshold={onEndReachedThreshold}
                initialNumToRender={initialNumToRender}
                windowSize={windowSize}
                contentContainerStyle={{ paddingBottom: 14 }}
                showsVerticalScrollIndicator={false}
                scrollEventThrottle={16}
                keyExtractor={item => item.id}
                onContentSizeChange={onContentReady}
            />
        </>
    );
}
