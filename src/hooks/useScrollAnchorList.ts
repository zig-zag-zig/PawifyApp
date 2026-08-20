import { useRef } from 'react';
import type { FlatList } from 'react-native';

/**
 * Refs shared between a page and its GenericList: the FlatList and the
 * selection manager's imperative handle.
 */
export function useScrollAnchorList<T extends { id: string }>() {
    const flatListRef = useRef<FlatList<T> | null>(null);
    const selectionManagerRef = useRef<{ clearSelection: () => void } | null>(null);

    return {
        flatListRef,
        selectionManagerRef,
    };
}