import { useRef } from 'react';

type WithId = { id: string };

export function useScrollAnchorList<T extends WithId>(_: T[]) {
    const flatListRef = useRef<any>(null);
    const selectionManagerRef = useRef<{ clearSelection: () => void }>(null);

    return {
        flatListRef,
        selectionManagerRef,
    };
}