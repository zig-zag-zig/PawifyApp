// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSelectionManager } from './useSelectionManager';

type Item = { id: string; name: string };

const items: Item[] = [
    { id: 'a', name: 'Alice' },
    { id: 'b', name: 'Bob' },
    { id: 'c', name: 'Charlie' },
];

describe('useSelectionManager', () => {
    it('starts with empty selection', () => {
        const { result } = renderHook(() => useSelectionManager(items));
        expect(result.current.selectedIds.size).toBe(0);
    });

    describe('toggleSelect', () => {
        it('adds an item to selection', () => {
            const { result } = renderHook(() => useSelectionManager(items));
            act(() => result.current.toggleSelect('a'));
            expect(result.current.selectedIds.has('a')).toBe(true);
            expect(result.current.selectedIds.size).toBe(1);
        });

        it('removes an item from selection on second toggle', () => {
            const { result } = renderHook(() => useSelectionManager(items));
            act(() => result.current.toggleSelect('a'));
            act(() => result.current.toggleSelect('a'));
            expect(result.current.selectedIds.has('a')).toBe(false);
            expect(result.current.selectedIds.size).toBe(0);
        });

        it('toggles multiple items independently', () => {
            const { result } = renderHook(() => useSelectionManager(items));
            act(() => result.current.toggleSelect('a'));
            act(() => result.current.toggleSelect('c'));
            expect(result.current.selectedIds.size).toBe(2);
            expect(result.current.selectedIds.has('a')).toBe(true);
            expect(result.current.selectedIds.has('c')).toBe(true);
        });
    });

    describe('clearSelection', () => {
        it('clears all selected items', () => {
            const { result } = renderHook(() => useSelectionManager(items));
            act(() => result.current.toggleSelect('a'));
            act(() => result.current.toggleSelect('b'));
            act(() => result.current.clearSelection());
            expect(result.current.selectedIds.size).toBe(0);
        });

        it('is a no-op when already empty', () => {
            const { result } = renderHook(() => useSelectionManager(items));
            act(() => result.current.clearSelection());
            expect(result.current.selectedIds.size).toBe(0);
        });
    });

    describe('selectAll', () => {
        it('selects all items when none selected', () => {
            const { result } = renderHook(() => useSelectionManager(items));
            act(() => result.current.selectAll());
            expect(result.current.selectedIds.size).toBe(3);
        });

        it('selects all items when some selected', () => {
            const { result } = renderHook(() => useSelectionManager(items));
            act(() => result.current.toggleSelect('a'));
            act(() => result.current.selectAll());
            expect(result.current.selectedIds.size).toBe(3);
        });

        it('deselects all when all are already selected', () => {
            const { result } = renderHook(() => useSelectionManager(items));
            act(() => result.current.selectAll());
            act(() => result.current.selectAll());
            expect(result.current.selectedIds.size).toBe(0);
        });

        it('handles empty items list', () => {
            const { result } = renderHook(() => useSelectionManager([]));
            act(() => result.current.selectAll());
            expect(result.current.selectedIds.size).toBe(0);
        });
    });

    describe('setSelectedIds', () => {
        it('allows direct setting of selected IDs', () => {
            const { result } = renderHook(() => useSelectionManager(items));
            act(() => result.current.setSelectedIds(new Set(['a', 'c'])));
            expect(result.current.selectedIds.size).toBe(2);
            expect(result.current.selectedIds.has('a')).toBe(true);
            expect(result.current.selectedIds.has('c')).toBe(true);
        });
    });
});
