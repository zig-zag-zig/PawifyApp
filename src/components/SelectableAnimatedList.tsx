import React, { forwardRef, useImperativeHandle } from 'react';
import { Animated, FlatList } from 'react-native';
import { useAnimatedDelete } from '../hooks/useAnimatedDelete';

export type SelectableAnimatedListHandle = {
    handleRemoveSelected: (ids: Set<string>, onRemovalComplete: () => void) => void;
};

type SelectableAnimatedListProps<T extends { id: string }> = {
    items: T[];
    onRemoveSelected: (ids: string[]) => void;
    renderItem: (props: {
        item: T;
        animValue: Animated.Value;
    }) => React.ReactElement | null;
    flatListRef: React.RefObject<FlatList<T> | null>;
    onEndReached?: () => void;
    onEndReachedThreshold?: number;
    initialNumToRender?: number;
    windowSize?: number;
    onContentReady: () => void;
};

const SelectableAnimatedList = forwardRef(function SelectableAnimatedList<T extends { id: string }>(
    {
        items,
        onRemoveSelected,
        renderItem,
        flatListRef,
        onEndReached,
        onEndReachedThreshold,
        initialNumToRender,
        windowSize,
        onContentReady,
    }: SelectableAnimatedListProps<T>,
    ref: React.Ref<SelectableAnimatedListHandle>
) {
    const {
        animationRefs,
        handleRemoveSelected,
    } = useAnimatedDelete(items, onRemoveSelected);

    useImperativeHandle(ref, () => ({
        handleRemoveSelected,
    }));

    return (
        <FlatList
            ref={flatListRef}
            data={items}
            renderItem={({ item }) => {
                const animValue = animationRefs.current[item.id] || new Animated.Value(1);
                animationRefs.current[item.id] = animValue;
                return renderItem({ item, animValue });
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
    );
}) as <T extends { id: string }>(
    props: SelectableAnimatedListProps<T> & { ref?: React.Ref<SelectableAnimatedListHandle> }
) => React.ReactElement;

export default SelectableAnimatedList;
