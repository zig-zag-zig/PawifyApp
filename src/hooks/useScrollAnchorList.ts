import { useRef } from 'react';
import type { FlatList } from 'react-native';

type WithId = { id: string };

export function useScrollAnchorList<T extends WithId>(_: T[]) {
    const flatListRef = useRef<FlatList<T> | null>(null);
    const selectionManagerRef = useRef<{ clearSelection: () => void } | null>(null);

    return {
        flatListRef,
        selectionManagerRef,
    };
}