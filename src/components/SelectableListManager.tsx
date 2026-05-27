import React, { useImperativeHandle, forwardRef, Ref } from 'react';
import { useSelectionManager } from '../hooks/useSelectionManager';
import AnimatedActionBar from './AnimatedActionBar';

interface SelectableListManagerProps<T extends { id: string }> {
    items: T[];
    selectionItems?: T[];
    onRemoveSelected: (ids: Set<string>, onRemovalComplete: () => void) => void;
    children: (props: {
        isInSelectionMode: boolean;
        selectedIds: Set<string>;
        toggleSelect: (id: string) => void;
        renderActionBar: () => React.ReactNode;
    }) => React.ReactNode;
}

const SelectableListManager = forwardRef(function SelectableListManager<T extends { id: string }>(
    {
        items,
        selectionItems,
        onRemoveSelected,
        children,
    }: SelectableListManagerProps<T>,
    ref: Ref<{ clearSelection: () => void }>
) {
    const {
        selectedIds,
        toggleSelect,
        clearSelection,
        selectAll,
    } = useSelectionManager(selectionItems ?? items);

    const removeSelected = () => {
        onRemoveSelected(new Set(selectedIds), clearSelection);
    };

    const renderActionBar = () => (
        <AnimatedActionBar
            selectedCount={selectedIds.size}
            onSelectAll={selectAll}
            onDelete={removeSelected}
            onCancel={clearSelection}
            visible={selectedIds.size > 0}
        />
    );

    const isInSelectionMode = selectedIds.size > 0;

    useImperativeHandle(ref, () => ({
        clearSelection,
    }));

    return children({
        isInSelectionMode,
        selectedIds,
        toggleSelect,
        renderActionBar,
    });
});

export default SelectableListManager;
