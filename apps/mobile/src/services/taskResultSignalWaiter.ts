import { AppState } from 'react-native';
import { scheduleIdleCallback } from '../utils/scheduleIdle';
import { EventService } from './eventService';
import { getExternalNavigationResumeDelayMs } from './externalNavigation';

export type TaskResultWaitSignal =
  | 'event'
  | 'resume'
  | 'notification-timeout'
  | 'poll-timeout'
  | 'overall-timeout';

type TaskResultSignalWaiterOptions = {
  fallbackFetchIntervalMs: number;
  getLastFetchAttemptAt: () => number;
  getPollingStarted: () => boolean;
  notificationWaitMs: number;
  timeoutMs: number;
  waitStartedAt: number;
};

export class TaskResultSignalWaiter {
  private deadline: number | null;
  private inactiveStartedAt: number | null;
  private waitAppState = AppState.currentState;

  constructor(private readonly options: TaskResultSignalWaiterOptions) {
    this.deadline = options.timeoutMs > 0 ? Date.now() + options.timeoutMs : null;
    this.inactiveStartedAt = this.waitAppState === 'active' ? null : Date.now();
  }

  resetDeadline(): void {
    if (this.deadline) {
      this.deadline = Date.now() + this.options.timeoutMs;
    }
  }

  getRemainingTimeoutMs(): number | null {
    this.syncWaitAppState();
    return this.deadline ? Math.max(0, this.deadline - Date.now()) : null;
  }

  async waitForNextSignal(taskId: string): Promise<TaskResultWaitSignal> {
    const taskEventName = `taskCompleted:${taskId}`;
    const pendingEvents = EventService.getPendingEvents();
    if (pendingEvents.has(taskEventName)) {
      EventService.consumeTaskCompletedEvent(taskId);
      return 'event';
    }

    const remainingTimeoutMs = this.getRemainingTimeoutMs();
    if (remainingTimeoutMs !== null && remainingTimeoutMs <= 0) {
      return 'overall-timeout';
    }

    return await new Promise<TaskResultWaitSignal>((resolve) => {
      let settled = false;
      const timeouts: ReturnType<typeof setTimeout>[] = [];
      let unsubscribeEvent: (() => void) | null = null;
      let appStateSubscription: { remove: () => void } | null = null;

      const finish = (reason: TaskResultWaitSignal) => {
        if (settled) {
          return;
        }

        settled = true;
        if (unsubscribeEvent) {
          unsubscribeEvent();
        }
        if (appStateSubscription) {
          appStateSubscription.remove();
        }
        timeouts.forEach(timeoutRef => clearTimeout(timeoutRef));
        resolve(reason);
      };

      unsubscribeEvent = EventService.addListener((eventName) => {
        if (eventName === taskEventName) {
          EventService.consumeTaskCompletedEvent(taskId);
          finish('event');
        }
      });

      appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
        const previousWaitAppState = this.waitAppState;
        this.syncWaitAppState();
        const now = Date.now();
        const canUseResumeFallback =
          nextAppState === 'active' &&
          previousWaitAppState !== 'active' &&
          now - this.options.waitStartedAt >= this.options.notificationWaitMs &&
          (
            this.options.getLastFetchAttemptAt() === 0 ||
            now - this.options.getLastFetchAttemptAt() >= this.options.fallbackFetchIntervalMs
          );

        if (canUseResumeFallback) {
          const finishAfterInteractions = () => {
            scheduleIdleCallback(() => finish('resume'));
          };
          const delayMs = getExternalNavigationResumeDelayMs({
            quietMs: 9000,
            stagger: true,
            staggerStepMs: 90,
            maxStaggerMs: 2200,
          });

          if (delayMs > 0) {
            timeouts.push(setTimeout(finishAfterInteractions, delayMs));
            return;
          }

          finishAfterInteractions();
        }
      });

      timeouts.push(setTimeout(
        () => finish(this.options.getPollingStarted() ? 'poll-timeout' : 'notification-timeout'),
        this.options.getPollingStarted() ? this.options.fallbackFetchIntervalMs : this.options.notificationWaitMs
      ));

      if (remainingTimeoutMs !== null) {
        const finishOverallTimeout = () => {
          const nextRemainingTimeoutMs = this.getRemainingTimeoutMs();
          if (nextRemainingTimeoutMs !== null && nextRemainingTimeoutMs <= 0) {
            finish('overall-timeout');
            return;
          }

          if (nextRemainingTimeoutMs !== null) {
            timeouts.push(setTimeout(finishOverallTimeout, nextRemainingTimeoutMs));
          }
        };
        timeouts.push(setTimeout(finishOverallTimeout, remainingTimeoutMs));
      }
    });
  }

  private syncWaitAppState(): void {
    const nextAppState = AppState.currentState;
    const previousAppState = this.waitAppState;
    if (previousAppState === nextAppState) {
      return;
    }

    const now = Date.now();
    this.waitAppState = nextAppState;
    if (previousAppState === 'active' && nextAppState !== 'active') {
      this.inactiveStartedAt = now;
      return;
    }

    if (nextAppState === 'active' && previousAppState !== 'active') {
      if (this.deadline && this.inactiveStartedAt) {
        this.deadline += now - this.inactiveStartedAt;
      }
      this.inactiveStartedAt = null;
    }
  }
}
