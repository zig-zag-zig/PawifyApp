import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockDiagnostics } from '../test/mocks';
import { EventService } from './eventService';

vi.mock('../utils/diagnostics', () => mockDiagnostics());

describe('EventService', () => {
    afterEach(() => {
        EventService.resetForTesting();
    });

    describe('addEvent', () => {
        it('returns true for new events', () => {
            expect(EventService.addEvent('test-event')).toBe(true);
        });

        it('returns false for duplicate events', () => {
            EventService.addEvent('test-event');
            expect(EventService.addEvent('test-event')).toBe(false);
        });

        it('returns true for different event names', () => {
            expect(EventService.addEvent('event-a')).toBe(true);
            expect(EventService.addEvent('event-b')).toBe(true);
        });
    });

    describe('consumeEvent', () => {
        it('removes and returns event payload', () => {
            EventService.addEvent('test-event', { data: 'value' });
            const payload = EventService.consumeEvent('test-event');
            expect(payload).toEqual({ data: 'value' });
        });

        it('returns undefined for non-existent event', () => {
            expect(EventService.consumeEvent('missing')).toBeUndefined();
        });

        it('returns undefined after consuming', () => {
            EventService.addEvent('test-event');
            EventService.consumeEvent('test-event');
            expect(EventService.consumeEvent('test-event')).toBeUndefined();
        });
    });

    describe('task ID dedup', () => {
        it('deduplicates taskCompleted events with colon format', () => {
            expect(EventService.addEvent('taskCompleted:task-123')).toBe(true);
            expect(EventService.addEvent('taskCompleted:task-123')).toBe(false);
        });

        it('marks task as handled after markTaskHandled', () => {
            EventService.markTaskHandled('task-123');
            expect(EventService.hasHandledTask('task-123')).toBe(true);
            expect(EventService.addEvent('taskCompleted:task-123')).toBe(false);
        });

        it('hasHandledTask returns false for unknown task', () => {
            expect(EventService.hasHandledTask('unknown')).toBe(false);
        });
    });

    describe('consumeTaskCompletedEvent', () => {
        it('removes specific task event', () => {
            EventService.addEvent('taskCompleted:task-1', { data: 'specific' });
            EventService.consumeTaskCompletedEvent('task-1');
            expect(EventService.getPendingEvents().has('taskCompleted:task-1')).toBe(false);
        });

        it('removes generic taskCompleted if taskId matches', () => {
            EventService.addEvent('taskCompleted', { taskId: 'task-1' });
            EventService.consumeTaskCompletedEvent('task-1');
            expect(EventService.getPendingEvents().has('taskCompleted')).toBe(false);
        });

        it('does not remove generic taskCompleted if taskId differs', () => {
            EventService.addEvent('taskCompleted', { taskId: 'task-1' });
            EventService.consumeTaskCompletedEvent('task-2');
            expect(EventService.getPendingEvents().has('taskCompleted')).toBe(true);
        });
    });

    describe('source push token filtering', () => {
        it('ignores events from own push token for client source events', () => {
            EventService.setClientPushToken('my-token');
            expect(EventService.addEvent('releases', { sourcePushToken: 'my-token' })).toBe(false);
        });

        it('accepts events from other push tokens', () => {
            EventService.setClientPushToken('my-token');
            expect(EventService.addEvent('releases', { sourcePushToken: 'other-token' })).toBe(true);
        });

        it('accepts events without push token', () => {
            EventService.setClientPushToken('my-token');
            expect(EventService.addEvent('releases')).toBe(true);
        });

        it('does not filter non-client-source events', () => {
            EventService.setClientPushToken('my-token');
            expect(EventService.addEvent('taskCompleted:task-1', { sourcePushToken: 'my-token' })).toBe(true);
        });
    });

    describe('listeners', () => {
        it('notifies listeners on new events', () => {
            const listener = vi.fn();
            EventService.addListener(listener);
            EventService.addEvent('test-event', { data: 'value' });
            expect(listener).toHaveBeenCalledWith('test-event', { data: 'value' });
        });

        it('does not notify for duplicate events', () => {
            const listener = vi.fn();
            EventService.addListener(listener);
            EventService.addEvent('test-event');
            listener.mockClear();
            EventService.addEvent('test-event');
            expect(listener).not.toHaveBeenCalled();
        });

        it('unsubscribe stops notifications', () => {
            const listener = vi.fn();
            const unsubscribe = EventService.addListener(listener);
            unsubscribe();
            EventService.addEvent('test-event');
            expect(listener).not.toHaveBeenCalled();
        });
    });

    describe('getPendingEvents', () => {
        it('returns copy of pending events', () => {
            EventService.addEvent('event-a', { data: 1 });
            EventService.addEvent('event-b', { data: 2 });
            const events = EventService.getPendingEvents();
            expect(events.size).toBe(2);
            expect(events.get('event-a')).toEqual({ data: 1 });
        });

        it('returns a copy, not the original map', () => {
            EventService.addEvent('event-a');
            const events = EventService.getPendingEvents();
            events.clear();
            expect(EventService.getPendingEvents().size).toBe(1);
        });
    });

    describe('client push token', () => {
        it('stores and retrieves push token', () => {
            expect(EventService.getClientPushToken()).toBeNull();
            EventService.setClientPushToken('token-123');
            expect(EventService.getClientPushToken()).toBe('token-123');
        });

        it('can be set to null', () => {
            EventService.setClientPushToken('token-123');
            EventService.setClientPushToken(null);
            expect(EventService.getClientPushToken()).toBeNull();
        });
    });
});
