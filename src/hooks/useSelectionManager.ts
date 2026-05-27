import { useCallback, useMemo, useState } from 'react';

export function useSelectionManager<T extends { id: string }>(items: T[]) {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const selectableIds = useMemo(() => items.map(item => item.id), [items]);

    const toggleSelect = useCallback((id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const clearSelection = useCallback(() => {
        setSelectedIds(prev => prev.size === 0 ? prev : new Set());
    }, []);

    const selectAll = useCallback(() => {
        setSelectedIds(prev => {
            if (selectableIds.length === 0) {
                return prev.size === 0 ? prev : new Set();
            }

            const everySelectableItemSelected = selectableIds.every(id => prev.has(id));
            if (everySelectableItemSelected && prev.size === selectableIds.length) {
                return new Set();
            }

            return new Set(selectableIds);
        });
    }, [selectableIds]);

    return {
        selectedIds,
        toggleSelect,
        clearSelection,
        selectAll,
        setSelectedIds,
    };
}
