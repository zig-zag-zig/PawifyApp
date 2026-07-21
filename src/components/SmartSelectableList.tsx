import React, { useRef } from 'react';
import { Animated, FlatList } from 'react-native';
import SelectableListManager from './SelectableListManager';
import SelectableAnimatedList, {
    type SelectableAnimatedListHandle,
} from './SelectableAnimatedList';

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

export function SmartSelectableList<T extends { id: string }>(
    {
        items,
        selectionItems,
        onRemoveSelected,
        renderCard,
        selectionManagerRef,
        onEndReached,
        onEndReachedThreshold,
        initialNumToRender,
        windowSize,
        onContentReady,
        flatListRef,
    }: SmartSelectableListProps<T>
) {
    const animatedListRef = useRef<SelectableAnimatedListHandle | null>(null);

    return (
        <SelectableListManager
            items={items}
            selectionItems={selectionItems}
            onRemoveSelected={(selectedIds, onRemovalComplete) => {
                if (animatedListRef.current && animatedListRef.current.handleRemoveSelected) {
                    animatedListRef.current.handleRemoveSelected(selectedIds, onRemovalComplete);
                } else {
                    onRemoveSelected(Array.from(selectedIds));
                    onRemovalComplete();
                }
            }}
            ref={selectionManagerRef}
        >
            {({
                isInSelectionMode,
                selectedIds,
                toggleSelect,
                renderActionBar,
            }) => (
                <>
                    {renderActionBar()}
                    <SelectableAnimatedList
                        items={items}
                        onRemoveSelected={onRemoveSelected}
                        renderItem={({ item, animValue }) =>
                            renderCard({
                                item,
                                isSelected: selectedIds.has(item.id),
                                isInSelectionMode,
                                onPress: () => toggleSelect(item.id),
                                onLongPress: () => toggleSelect(item.id),
                                animValue,
                            }) as React.ReactElement
                        }
                        flatListRef={flatListRef}
                        onEndReached={onEndReached}
                        onEndReachedThreshold={onEndReachedThreshold}
                        initialNumToRender={initialNumToRender}
                        windowSize={windowSize}
                        onContentReady={onContentReady}
                        ref={animatedListRef}
                    />
                </>
            )}
        </SelectableListManager>
    );
}
