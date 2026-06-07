import { describe, expect, it, vi } from 'vitest';
import {
  extractNotificationEventData,
  extractNotificationEventPayload,
  extractTaskId,
  getTaskCompletedEventName,
  shouldPersistBackgroundEvent,
} from './notificationEventParsing';

describe('notification event parsing', () => {
  it('extracts direct event payloads while dropping envelope-only fields', () => {
    expect(extractNotificationEventPayload({
      eventName: 'releases',
      dataString: '{}',
      body: 'ignored',
      sourcePushToken: 'push-token',
    })).toEqual({
      sourcePushToken: 'push-token',
    });
  });

  it('prefers nested payload objects', () => {
    expect(extractNotificationEventPayload({
      eventName: 'taskCompleted',
      payload: {
        taskId: 'task-1',
      },
    })).toEqual({
      taskId: 'task-1',
    });
  });

  it('parses JSON body payloads and keeps the envelope event name as fallback', () => {
    expect(extractNotificationEventData({
      eventName: 'taskCompleted',
      body: JSON.stringify({
        payload: {
          taskId: 'task-2',
        },
      }),
    })).toEqual({
      eventName: 'taskCompleted',
      payload: {
        taskId: 'task-2',
      },
    });
  });

  it('returns null for malformed JSON without an envelope event name', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(extractNotificationEventData({
      body: '{not-json',
    })).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      'fcm: parse notification payload failed',
      expect.objectContaining({
        payloadPreview: '{not-json',
      }),
    );

    warnSpy.mockRestore();
  });
});

describe('notification task event helpers', () => {
  it('normalizes task completion event names', () => {
    expect(extractTaskId({ taskId: 'task-3' })).toBe('task-3');
    expect(extractTaskId({ id: 'task-4' })).toBe('task-4');
    expect(getTaskCompletedEventName({ taskId: 'task-5' })).toBe('taskCompleted:task-5');
  });

  it('only persists durable app and task events', () => {
    expect(shouldPersistBackgroundEvent('following')).toBe(true);
    expect(shouldPersistBackgroundEvent('releases')).toBe(true);
    expect(shouldPersistBackgroundEvent('releaseNotificationSettings')).toBe(true);
    expect(shouldPersistBackgroundEvent('taskCompleted')).toBe(true);
    expect(shouldPersistBackgroundEvent('taskCompleted:task-6')).toBe(true);
    expect(shouldPersistBackgroundEvent('other')).toBe(false);
  });
});
