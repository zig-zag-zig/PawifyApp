import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock AsyncStorage with in-memory store
let storage: Record<string, string> = {};

vi.mock('@react-native-async-storage/async-storage', () => ({
    default: {
        getItem: vi.fn(async (key: string) => storage[key] ?? null),
        setItem: vi.fn(async (key: string, value: string) => {
            storage[key] = value;
        }),
        removeItem: vi.fn(async (key: string) => {
            delete storage[key];
        }),
    },
}));

describe('backgroundEventStorage', () => {
    beforeEach(() => {
        storage = {};
    });

    async function loadModule() {
        const mod = await import('./backgroundEventStorage');
        return mod;
    }

    describe('addPendingBackgroundEvent', () => {
        it('stores a new event', async () => {
            const { addPendingBackgroundEvent, takePendingBackgroundEvents } = await loadModule();
            await addPendingBackgroundEvent('test-event', { data: 'value' });
            const events = await takePendingBackgroundEvents();
            expect(events).toHaveLength(1);
            expect(events[0].eventName).toBe('test-event');
            expect(events[0].payload).toEqual({ data: 'value' });
        });

        it('replaces existing event with same name', async () => {
            const { addPendingBackgroundEvent, takePendingBackgroundEvents } = await loadModule();
            await addPendingBackgroundEvent('test-event', { data: 'first' });
            await addPendingBackgroundEvent('test-event', { data: 'second' });
            const events = await takePendingBackgroundEvents();
            expect(events).toHaveLength(1);
            expect(events[0].payload).toEqual({ data: 'second' });
        });

        it('stores multiple different events', async () => {
            const { addPendingBackgroundEvent, takePendingBackgroundEvents } = await loadModule();
            await addPendingBackgroundEvent('event-a', { data: 1 });
            await addPendingBackgroundEvent('event-b', { data: 2 });
            const events = await takePendingBackgroundEvents();
            expect(events).toHaveLength(2);
        });

        it('stores event without payload', async () => {
            const { addPendingBackgroundEvent, takePendingBackgroundEvents } = await loadModule();
            await addPendingBackgroundEvent('no-payload');
            const events = await takePendingBackgroundEvents();
            expect(events).toHaveLength(1);
            expect(events[0].eventName).toBe('no-payload');
            expect(events[0].payload).toBeUndefined();
        });
    });

    describe('takePendingBackgroundEvents', () => {
        it('returns empty array when no events', async () => {
            const { takePendingBackgroundEvents } = await loadModule();
            const events = await takePendingBackgroundEvents();
            expect(events).toEqual([]);
        });

        it('clears events after taking', async () => {
            const { addPendingBackgroundEvent, takePendingBackgroundEvents } = await loadModule();
            await addPendingBackgroundEvent('test-event');
            await takePendingBackgroundEvents();
            const events = await takePendingBackgroundEvents();
            expect(events).toEqual([]);
        });
    });

    describe('parseStoredEvents edge cases', () => {
        it('handles invalid JSON in storage', async () => {
            const { takePendingBackgroundEvents } = await loadModule();
            storage['pendingBackgroundEvents'] = 'not-json';
            const events = await takePendingBackgroundEvents();
            expect(events).toEqual([]);
        });

        it('handles non-array JSON in storage', async () => {
            const { takePendingBackgroundEvents } = await loadModule();
            storage['pendingBackgroundEvents'] = '{"not":"array"}';
            const events = await takePendingBackgroundEvents();
            expect(events).toEqual([]);
        });

        it('filters out events without eventName string', async () => {
            const { takePendingBackgroundEvents } = await loadModule();
            storage['pendingBackgroundEvents'] = JSON.stringify([
                { eventName: 'valid' },
                { noEventName: true },
                'not-an-object',
                null,
                { eventName: 123 },
            ]);
            const events = await takePendingBackgroundEvents();
            expect(events).toHaveLength(1);
            expect(events[0].eventName).toBe('valid');
        });
    });
});
