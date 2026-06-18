// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRemoveConfirmation } from './useRemoveConfirmation';

describe('useRemoveConfirmation', () => {
    it('starts with prompt invisible and no pending ids', () => {
        const { result } = renderHook(() => useRemoveConfirmation());
        expect(result.current.promptVisible).toBe(false);
        expect(result.current.pendingIds).toEqual([]);
    });

    it('requestRemove shows prompt with ids and confirm action', () => {
        const { result } = renderHook(() => useRemoveConfirmation());
        const confirmAction = () => { };

        act(() => {
            result.current.requestRemove(['a', 'b'], confirmAction);
        });

        expect(result.current.promptVisible).toBe(true);
        expect(result.current.pendingIds).toEqual(['a', 'b']);
    });

    it('handleConfirm calls confirm action and resets state', () => {
        const { result } = renderHook(() => useRemoveConfirmation());
        let called = false;

        act(() => {
            result.current.requestRemove(['a'], () => { called = true; });
        });
        act(() => {
            result.current.handleConfirm();
        });

        expect(called).toBe(true);
        expect(result.current.promptVisible).toBe(false);
        expect(result.current.pendingIds).toEqual([]);
    });

    it('handleCancel resets state without calling confirm', () => {
        const { result } = renderHook(() => useRemoveConfirmation());
        let called = false;

        act(() => {
            result.current.requestRemove(['a'], () => { called = true; });
        });
        act(() => {
            result.current.handleCancel();
        });

        expect(called).toBe(false);
        expect(result.current.promptVisible).toBe(false);
        expect(result.current.pendingIds).toEqual([]);
    });
});
