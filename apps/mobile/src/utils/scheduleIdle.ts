type CancelIdleCallback = () => void;

export function scheduleIdleCallback(callback: () => void): CancelIdleCallback {
    if (typeof globalThis.requestIdleCallback === 'function') {
        const idleCallbackId = globalThis.requestIdleCallback(callback);
        return () => globalThis.cancelIdleCallback?.(idleCallbackId);
    }

    const timeoutId = setTimeout(callback, 0);
    return () => clearTimeout(timeoutId);
}