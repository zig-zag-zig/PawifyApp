import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/diagnostics', () => ({
    describeValueShape: vi.fn(() => ({})),
    diagnosticLog: vi.fn(),
    diagnosticWarn: vi.fn(),
}));

// We need to reset module state between tests.
// The EventService uses module-level mutable state, so we re-import per test group.
describe('EventService', () => {
    afterEach(() => {
        vi.resetModules();
    });

    async function createService() {
        const mod = await import('./eventService');
        return mod.EventService;
    }

    describe('addEvent', () => {
        it('returns true for new events', async () => {
            const svc = await createService();
            expect(svc.addEvent('test-event')).toBe(true);
        });

        it('returns false for duplicate events', async () => {
            const svc = await createService();
            svc.addEvent('test-event');
            expect(svc.addEvent('test-event')).toBe(false);
        });

        it('returns true for different event names', async () => {
            const svc = await createService();
            expect(svc.addEvent('event-a')).toBe(true);
            expect(svc.addEvent('event-b')).toBe(true);
        });
    });

    describe('consumeEvent', () => {
        it('removes and returns event payload', async () => {
            const svc = await createService();
            svc.addEvent('test-event', { data: 'value' });
            const payload = svc.consumeEvent('test-event');
            expect(payload).toEqual({ data: 'value' });
        });

        it('returns undefined for non-existent event', async () => {
            const svc = await createService();
            expect(svc.consumeEvent('missing')).toBeUndefined();
        });

        it('returns undefined after consuming', async () => {
            const svc = await createService();
            svc.addEvent('test-event');
            svc.consumeEvent('test-event');
            expect(svc.consumeEvent('test-event')).toBeUndefined();
        });
    });

    describe('task ID dedup', () => {
        it('deduplicates taskCompleted events with colon format', async () => {
            const svc = await createService();
            expect(svc.addEvent('taskCompleted:task-123')).toBe(true);
            expect(svc.addEvent('taskCompleted:task-123')).toBe(false);
        });

        it('marks task as handled after markTaskHandled', async () => {
            const svc = await createService();
            svc.markTaskHandled('task-123');
            expect(svc.hasHandledTask('task-123')).toBe(true);
            expect(svc.addEvent('taskCompleted:task-123')).toBe(false);
        });

        it('hasHandledTask returns false for unknown task', async () => {
            const svc = await createService();
            expect(svc.hasHandledTask('unknown')).toBe(false);
        });
    });

    describe('consumeTaskCompletedEvent', () => {
        it('removes specific task event', async () => {
            const svc = await createService();
            svc.addEvent('taskCompleted:task-1', { data: 'specific' });
            svc.consumeTaskCompletedEvent('task-1');
            expect(svc.getPendingEvents().has('taskCompleted:task-1')).toBe(false);
        });

        it('removes generic taskCompleted if taskId matches', async () => {
            const svc = await createService();
            svc.addEvent('taskCompleted', { taskId: 'task-1' });
            svc.consumeTaskCompletedEvent('task-1');
            expect(svc.getPendingEvents().has('taskCompleted')).toBe(false);
        });

        it('does not remove generic taskCompleted if taskId differs', async () => {
            const svc = await createService();
            svc.addEvent('taskCompleted', { taskId: 'task-1' });
            svc.consumeTaskCompletedEvent('task-2');
            expect(svc.getPendingEvents().has('taskCompleted')).toBe(true);
        });
    });

    describe('source push token filtering', () => {
        it('ignores events from own push token for client source events', async () => {
            const svc = await createService();
            svc.setClientPushToken('my-token');
            expect(svc.addEvent('releases', { sourcePushToken: 'my-token' })).toBe(false);
        });

        it('accepts events from other push tokens', async () => {
            const svc = await createService();
            svc.setClientPushToken('my-token');
            expect(svc.addEvent('releases', { sourcePushToken: 'other-token' })).toBe(true);
        });

        it('accepts events without push token', async () => {
            const svc = await createService();
            svc.setClientPushToken('my-token');
            expect(svc.addEvent('releases')).toBe(true);
        });

        it('does not filter non-client-source events', async () => {
            const svc = await createService();
            svc.setClientPushToken('my-token');
            expect(svc.addEvent('taskCompleted:task-1', { sourcePushToken: 'my-token' })).toBe(true);
        });
    });

    describe('listeners', () => {
        it('notifies listeners on new events', async () => {
            const svc = await createService();
            const listener = vi.fn();
            svc.addListener(listener);
            svc.addEvent('test-event', { data: 'value' });
            expect(listener).toHaveBeenCalledWith('test-event', { data: 'value' });
        });

        it('does not notify for duplicate events', async () => {
            const svc = await createService();
            const listener = vi.fn();
            svc.addListener(listener);
            svc.addEvent('test-event');
            listener.mockClear();
            svc.addEvent('test-event');
            expect(listener).not.toHaveBeenCalled();
        });

        it('unsubscribe stops notifications', async () => {
            const svc = await createService();
            const listener = vi.fn();
            const unsubscribe = svc.addListener(listener);
            unsubscribe();
            svc.addEvent('test-event');
            expect(listener).not.toHaveBeenCalled();
        });
    });

    describe('getPendingEvents', () => {
        it('returns copy of pending events', async () => {
            const svc = await createService();
            svc.addEvent('event-a', { data: 1 });
            svc.addEvent('event-b', { data: 2 });
            const events = svc.getPendingEvents();
            expect(events.size).toBe(2);
            expect(events.get('event-a')).toEqual({ data: 1 });
        });

        it('returns a copy, not the original map', async () => {
            const svc = await createService();
            svc.addEvent('event-a');
            const events = svc.getPendingEvents();
            events.clear();
            expect(svc.getPendingEvents().size).toBe(1);
        });
    });

    describe('client push token', () => {
        it('stores and retrieves push token', async () => {
            const svc = await createService();
            expect(svc.getClientPushToken()).toBeNull();
            svc.setClientPushToken('token-123');
            expect(svc.getClientPushToken()).toBe('token-123');
        });

        it('can be set to null', async () => {
            const svc = await createService();
            svc.setClientPushToken('token-123');
            svc.setClientPushToken(null);
            expect(svc.getClientPushToken()).toBeNull();
        });
    });
});
