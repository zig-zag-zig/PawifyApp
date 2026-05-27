import React, { useRef } from 'react';
import SelectableListManager from './SelectableListManager';
import SelectableAnimatedList from './SelectableAnimatedList';

type AnimatedListRef = {
    handleRemoveSelected: (ids: Set<string>, onRemovalComplete: () => void) => void;
};

type SmartSelectableListProps<T extends { id: string }> = {
    items: T[];
    selectionItems?: T[];
    onRemoveSelected: (ids: string[]) => void;
    renderCard: any;
    selectionManagerRef: React.RefObject<any>;
    flatListRef: React.RefObject<any>;
    onEndReached?: () => void;
    onEndReachedThreshold?: number;
    initialNumToRender?: number;
    windowSize?: number;
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
        flatListRef,
    }: SmartSelectableListProps<T>
) {
    const animatedListRef = useRef<AnimatedListRef | null>(null);

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
                        renderItem={({ item, animValue }: {
                            item: T;
                            animValue: any;
                        }) =>
                            renderCard({
                                item,
                                isSelected: selectedIds.has(item.id),
                                isInSelectionMode,
                                onPress: () => toggleSelect(item.id),
                                onLongPress: () => toggleSelect(item.id),
                                animValue,
                            })
                        }
                        flatListRef={flatListRef}
                        onEndReached={onEndReached}
                        onEndReachedThreshold={onEndReachedThreshold}
                        initialNumToRender={initialNumToRender}
                        windowSize={windowSize}
                        ref={animatedListRef}
                    />
                </>
            )}
        </SelectableListManager>
    );
}
