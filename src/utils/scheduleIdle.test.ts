import { describe, expect, it, vi, afterEach } from 'vitest';
import { scheduleIdleCallback } from './scheduleIdle';

describe('scheduleIdleCallback', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('uses requestIdleCallback when available', () => {
        const idleId = 42;
        const originalIdleCallback = globalThis.requestIdleCallback;
        const cancelSpy = vi.fn();

        globalThis.requestIdleCallback = vi.fn(() => idleId) as any;
        globalThis.cancelIdleCallback = cancelSpy;

        const callback = vi.fn();
        const cancel = scheduleIdleCallback(callback);

        expect(globalThis.requestIdleCallback).toHaveBeenCalledWith(callback);

        cancel();
        expect(cancelSpy).toHaveBeenCalledWith(idleId);

        globalThis.requestIdleCallback = originalIdleCallback;
        delete (globalThis as any).cancelIdleCallback;
    });

    it('falls back to setTimeout when requestIdleCallback is unavailable', () => {
        const originalIdleCallback = globalThis.requestIdleCallback;
        delete (globalThis as any).requestIdleCallback;

        vi.useFakeTimers();

        const callback = vi.fn();
        const cancel = scheduleIdleCallback(callback);

        vi.advanceTimersByTime(0);
        expect(callback).toHaveBeenCalledTimes(1);

        cancel();
        // verify no throw after cancel

        vi.useRealTimers();
        globalThis.requestIdleCallback = originalIdleCallback;
    });

    it('cancel is a no-op when already cancelled', () => {
        const originalIdleCallback = globalThis.requestIdleCallback;
        delete (globalThis as any).requestIdleCallback;

        vi.useFakeTimers();

        const cancel = scheduleIdleCallback(vi.fn());
        cancel();
        // Second cancel should not throw
        expect(() => cancel()).not.toThrow();

        vi.useRealTimers();
        globalThis.requestIdleCallback = originalIdleCallback;
    });
});
