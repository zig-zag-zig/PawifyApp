// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
    AppState: {
        currentState: 'active',
        addEventListener: vi.fn(() => ({ remove: vi.fn() })),
    },
}));

vi.mock('../utils/scheduleIdle', () => ({
    scheduleIdleCallback: vi.fn((cb: () => void) => setTimeout(cb, 0)),
}));

vi.mock('./eventService', () => ({
    EventService: {
        getPendingEvents: vi.fn(() => new Map()),
        consumeTaskCompletedEvent: vi.fn(),
        addListener: vi.fn(() => vi.fn()),
    },
}));

vi.mock('./externalNavigation', () => ({
    getExternalNavigationResumeDelayMs: vi.fn(() => 0),
    openExternalUrl: vi.fn(),
}));

import { AppState } from 'react-native';
import { EventService } from './eventService';
import { getExternalNavigationResumeDelayMs } from './externalNavigation';
import { TaskResultSignalWaiter } from './taskResultSignalWaiter';

type WaiterOptions = {
    fallbackFetchIntervalMs: number;
    getLastFetchAttemptAt: () => number;
    getPollingStarted: () => boolean;
    notificationWaitMs: number;
    timeoutMs: number;
    waitStartedAt: number;
};

const mockAppState = AppState as unknown as {
    currentState: string;
    addEventListener: ReturnType<typeof vi.fn>;
};

function createOptions(overrides: Partial<WaiterOptions> = {}): WaiterOptions {
    return {
        fallbackFetchIntervalMs: 1000,
        getLastFetchAttemptAt: () => 0,
        getPollingStarted: () => false,
        notificationWaitMs: 5000,
        timeoutMs: 30000,
        waitStartedAt: Date.now(),
        ...overrides,
    };
}

describe('TaskResultSignalWaiter', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        mockAppState.currentState = 'active';
        // Reset default mocks to known state for each test
        vi.mocked(mockAppState.addEventListener).mockReturnValue({ remove: vi.fn() });
        vi.mocked(EventService.getPendingEvents).mockReturnValue(new Map());
        vi.mocked(EventService.addListener).mockReturnValue(vi.fn());
        vi.mocked(getExternalNavigationResumeDelayMs).mockReturnValue(0);
        vi.mocked(EventService.consumeTaskCompletedEvent).mockClear();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    describe('waitForNextSignal', () => {
        it('returns event signal immediately when task event already pending', async () => {
            const pendingEvents = new Map<string, { taskId: string } | undefined>();
            pendingEvents.set('taskCompleted:task-1', { taskId: 'task-1' });
            vi.mocked(EventService.getPendingEvents).mockReturnValue(
                pendingEvents as ReturnType<typeof EventService.getPendingEvents>,
            );

            const waiter = new TaskResultSignalWaiter(createOptions());
            const signal = await waiter.waitForNextSignal('task-1');

            expect(signal).toBe('event');
            expect(EventService.consumeTaskCompletedEvent).toHaveBeenCalledWith('task-1');
        });

        it('returns overall-timeout when total time exceeds deadline', async () => {
            const now = Date.now();
            vi.setSystemTime(now);

            const waiter = new TaskResultSignalWaiter(createOptions({
                timeoutMs: 100,
                waitStartedAt: now,
            }));

            const signalPromise = waiter.waitForNextSignal('task-1');
            vi.advanceTimersByTime(200);

            const signal = await signalPromise;
            expect(signal).toBe('overall-timeout');
        });

        it('returns notification-timeout after notificationWaitMs with no event', async () => {
            const waiter = new TaskResultSignalWaiter(createOptions({
                notificationWaitMs: 100,
            }));

            const signalPromise = waiter.waitForNextSignal('task-1');
            vi.advanceTimersByTime(100);

            const signal = await signalPromise;
            expect(signal).toBe('notification-timeout');
        });

        it('returns poll-timeout when polling has already started', async () => {
            const waiter = new TaskResultSignalWaiter(createOptions({
                notificationWaitMs: 100,
                fallbackFetchIntervalMs: 80,
                getPollingStarted: () => true,
            }));

            const signalPromise = waiter.waitForNextSignal('task-1');
            // polling mode uses fallbackFetchIntervalMs, not notificationWaitMs
            vi.advanceTimersByTime(80);

            const signal = await signalPromise;
            expect(signal).toBe('poll-timeout');
        });

        it('fires event signal when listener receives matching task event', async () => {
            let capturedListener: ((eventName: string) => void) | undefined;
            vi.mocked(EventService.addListener).mockImplementation(
                (cb: (eventName: string) => void) => {
                    capturedListener = cb;
                    return vi.fn();
                },
            );

            const waiter = new TaskResultSignalWaiter(createOptions({
                notificationWaitMs: 100,
            }));

            const signalPromise = waiter.waitForNextSignal('task-2');

            vi.advanceTimersByTime(50);
            capturedListener?.('taskCompleted:task-2');

            const signal = await signalPromise;
            expect(signal).toBe('event');
            expect(EventService.consumeTaskCompletedEvent).toHaveBeenCalledWith('task-2');
        });

        it('ignores non-matching events from listener', async () => {
            let capturedListener: ((eventName: string) => void) | undefined;
            vi.mocked(EventService.addListener).mockImplementation(
                (cb: (eventName: string) => void) => {
                    capturedListener = cb;
                    return vi.fn();
                },
            );

            const waiter = new TaskResultSignalWaiter(createOptions({
                notificationWaitMs: 100,
            }));

            const signalPromise = waiter.waitForNextSignal('task-3');

            vi.advanceTimersByTime(30);
            capturedListener?.('taskCompleted:other-task');

            vi.advanceTimersByTime(70);

            const signal = await signalPromise;
            expect(signal).toBe('notification-timeout');
        });

        it('AppState change to active triggers resume signal after notification wait', async () => {
            let capturedAppStateListener: ((state: string) => void) | undefined;
            vi.mocked(mockAppState.addEventListener).mockImplementation(
                (_event: string, cb: (state: string) => void) => {
                    capturedAppStateListener = cb;
                    return { remove: vi.fn() };
                },
            );

            mockAppState.currentState = 'background';
            const startTime = Date.now();
            vi.setSystemTime(startTime);

            const waiter = new TaskResultSignalWaiter(createOptions({
                notificationWaitMs: 100,
                waitStartedAt: startTime - 200,
            }));

            const signalPromise = waiter.waitForNextSignal('task-1');

            vi.advanceTimersByTime(50);
            mockAppState.currentState = 'active';
            capturedAppStateListener?.('active');

            await vi.advanceTimersByTimeAsync(10);

            const signal = await signalPromise;
            expect(signal).toBe('resume');
        });

        it('AppState to active does not trigger resume before notification wait elapsed', async () => {
            let capturedAppStateListener: ((state: string) => void) | undefined;
            vi.mocked(mockAppState.addEventListener).mockImplementation(
                (_event: string, cb: (state: string) => void) => {
                    capturedAppStateListener = cb;
                    return { remove: vi.fn() };
                },
            );

            mockAppState.currentState = 'background';
            const startTime = Date.now();
            vi.setSystemTime(startTime);

            const waiter = new TaskResultSignalWaiter(createOptions({
                notificationWaitMs: 5000,
                waitStartedAt: startTime,
            }));

            const signalPromise = waiter.waitForNextSignal('task-1');

            vi.advanceTimersByTime(10);
            capturedAppStateListener?.('active');

            vi.advanceTimersByTime(4990);

            const signal = await signalPromise;
            expect(signal).toBe('notification-timeout');
        });

        it('resume signal respects external navigation delay', async () => {
            let capturedAppStateListener: ((state: string) => void) | undefined;
            vi.mocked(mockAppState.addEventListener).mockImplementation(
                (_event: string, cb: (state: string) => void) => {
                    capturedAppStateListener = cb;
                    return { remove: vi.fn() };
                },
            );

            vi.mocked(getExternalNavigationResumeDelayMs).mockReturnValue(50);

            mockAppState.currentState = 'background';
            const startTime = Date.now();
            vi.setSystemTime(startTime);

            const waiter = new TaskResultSignalWaiter(createOptions({
                waitStartedAt: startTime - 10000,
            }));

            const signalPromise = waiter.waitForNextSignal('task-1');

            vi.advanceTimersByTime(10);
            mockAppState.currentState = 'active';
            capturedAppStateListener?.('active');

            await vi.advanceTimersByTimeAsync(60);

            const signal = await signalPromise;
            expect(signal).toBe('resume');
        });

        it('settles only once even with multiple signals', async () => {
            let capturedAppStateListener: ((state: string) => void) | undefined;
            vi.mocked(mockAppState.addEventListener).mockImplementation(
                (_event: string, cb: (state: string) => void) => {
                    capturedAppStateListener = cb;
                    return { remove: vi.fn() };
                },
            );

            mockAppState.currentState = 'background';
            const startTime = Date.now();
            vi.setSystemTime(startTime);

            const waiter = new TaskResultSignalWaiter(createOptions({
                waitStartedAt: startTime - 10000,
            }));

            const signalPromise = waiter.waitForNextSignal('task-4');

            vi.advanceTimersByTime(10);
            mockAppState.currentState = 'active';
            capturedAppStateListener?.('active');

            await vi.advanceTimersByTimeAsync(10);

            const signal = await signalPromise;
            expect(signal).toBe('resume');
        });
    });

    describe('getRemainingTimeoutMs', () => {
        it('returns remaining timeout when deadline is set', () => {
            const startTime = Date.now();
            vi.setSystemTime(startTime);

            const waiter = new TaskResultSignalWaiter(createOptions({
                timeoutMs: 10000,
                waitStartedAt: startTime,
            }));

            vi.advanceTimersByTime(3000);
            const remaining = waiter.getRemainingTimeoutMs();
            expect(remaining).toBeGreaterThan(0);
            expect(remaining).toBeLessThanOrEqual(7000);
        });

        it('returns null when timeoutMs is 0 (no deadline)', () => {
            const waiter = new TaskResultSignalWaiter(createOptions({ timeoutMs: 0 }));
            expect(waiter.getRemainingTimeoutMs()).toBeNull();
        });

        it('extends deadline during background time', () => {
            const startTime = Date.now();
            vi.setSystemTime(startTime);

            const waiter = new TaskResultSignalWaiter(createOptions({
                timeoutMs: 10000,
                waitStartedAt: startTime,
            }));

            mockAppState.currentState = 'background';
            waiter.getRemainingTimeoutMs();

            vi.advanceTimersByTime(5000);

            mockAppState.currentState = 'active';
            const remaining = waiter.getRemainingTimeoutMs();
            expect(remaining).toBeGreaterThanOrEqual(9000);
        });
    });

    describe('resetDeadline', () => {
        it('resets deadline when timeoutMs is set', () => {
            const startTime = Date.now();
            vi.setSystemTime(startTime);

            const waiter = new TaskResultSignalWaiter(createOptions({
                timeoutMs: 10000,
                waitStartedAt: startTime,
            }));

            vi.advanceTimersByTime(8000);
            waiter.resetDeadline();

            const remaining = waiter.getRemainingTimeoutMs();
            expect(remaining).toBeGreaterThan(9000);
        });

        it('is a no-op when timeoutMs is 0', () => {
            const waiter = new TaskResultSignalWaiter(createOptions({ timeoutMs: 0 }));
            expect(() => waiter.resetDeadline()).not.toThrow();
            expect(waiter.getRemainingTimeoutMs()).toBeNull();
        });
    });
});
