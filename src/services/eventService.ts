import {
    describeValueShape,
    diagnosticLog,
} from '../utils/diagnostics';

export type EventPayload = Record<string, any>;
const pendingEvents = new Map<string, EventPayload | undefined>();
const eventListeners = new Set<(eventName: string, payload: EventPayload | undefined) => void>();
const handledTaskIds = new Set<string>();
const handledTaskIdOrder: string[] = [];
const maxHandledTaskIds = 500;
const clientSourceEventNames = new Set(['following', 'releases', 'releaseNotificationSettings']);
let clientPushToken: string | null = null;

function extractTaskId(eventName: string, payload?: EventPayload): string | null {
    if (eventName.startsWith('taskCompleted:')) {
        const taskId = eventName.slice('taskCompleted:'.length);
        return taskId.length > 0 ? taskId : null;
    }

    if (eventName === 'taskCompleted') {
        const maybeTaskId = payload?.taskId ?? payload?.id;
        return typeof maybeTaskId === 'string' && maybeTaskId.length > 0
            ? maybeTaskId
            : null;
    }

    return null;
}

function rememberHandledTaskId(taskId: string) {
    if (handledTaskIds.has(taskId)) {
        return;
    }

    handledTaskIds.add(taskId);
    handledTaskIdOrder.push(taskId);

    while (handledTaskIdOrder.length > maxHandledTaskIds) {
        const oldestTaskId = handledTaskIdOrder.shift();
        if (oldestTaskId) {
            handledTaskIds.delete(oldestTaskId);
        }
    }
}

function getPayloadString(payload: unknown, key: string): string | null {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    const value = (payload as Record<string, unknown>)[key];
    return typeof value === 'string' && value.length > 0 ? value : null;
}

function extractSourcePushToken(payload?: EventPayload): string | null {
    const directKeys = [
        'sourcePushToken',
        'clientPushToken',
        'originPushToken',
        'initiatorPushToken',
        'pushToken',
    ];

    for (const key of directKeys) {
        const value = getPayloadString(payload, key);
        if (value) {
            return value;
        }
    }

    const nestedKeys = ['source', 'client', 'origin', 'initiator'];
    for (const nestedKey of nestedKeys) {
        const nestedValue = payload?.[nestedKey];
        for (const directKey of directKeys) {
            const value = getPayloadString(nestedValue, directKey);
            if (value) {
                return value;
            }
        }
    }

    return null;
}

function isOwnSourceEvent(eventName: string, payload?: EventPayload): boolean {
    if (!clientPushToken || !clientSourceEventNames.has(eventName)) {
        return false;
    }

    return extractSourcePushToken(payload) === clientPushToken;
}

export const EventService = {
    addEvent: (eventName: string, payload?: EventPayload) => {
        const taskId = extractTaskId(eventName, payload);
        if (taskId && handledTaskIds.has(taskId)) {
            diagnosticLog('event-service', 'task-event-ignored-already-handled', {
                eventName,
                taskId,
                payloadShape: describeValueShape(payload),
            });
            return false;
        }

        if (isOwnSourceEvent(eventName, payload)) {
            diagnosticLog('event-service', 'source-event-ignored-current-client', {
                eventName,
                payloadShape: describeValueShape(payload),
            });
            return false;
        }

        if (!pendingEvents.has(eventName)) {
            pendingEvents.set(eventName, payload);
            if (taskId || eventName === 'taskCompleted' || eventName.startsWith('taskCompleted:')) {
                diagnosticLog('event-service', 'event-added', {
                    eventName,
                    taskId,
                    pendingEventCount: pendingEvents.size,
                    listenerCount: eventListeners.size,
                    payloadShape: describeValueShape(payload),
                });
            }
            eventListeners.forEach(cb => cb(eventName, payload));
            return true;
        }

        if (taskId || eventName === 'taskCompleted' || eventName.startsWith('taskCompleted:')) {
            diagnosticLog('event-service', 'event-already-pending', {
                eventName,
                taskId,
                pendingEventCount: pendingEvents.size,
                payloadShape: describeValueShape(payload),
            });
        }

        return false;
    },

    consumeEvent: (eventName: string) => {
        const payload = pendingEvents.get(eventName);
        pendingEvents.delete(eventName);
        return payload;
    },

    consumeTaskCompletedEvent: (taskId: string) => {
        pendingEvents.delete(`taskCompleted:${taskId}`);

        const genericTaskCompletedPayload = pendingEvents.get('taskCompleted');
        if (extractTaskId('taskCompleted', genericTaskCompletedPayload) === taskId) {
            pendingEvents.delete('taskCompleted');
        }
    },

    addListener: (callback: (eventName: string, payload?: EventPayload) => void) => {
        eventListeners.add(callback);
        return () => eventListeners.delete(callback);
    },

    getPendingEvents: () => new Map(pendingEvents),

    setClientPushToken: (pushToken: string | null) => {
        clientPushToken = pushToken;
    },

    getClientPushToken: () => clientPushToken,

    hasHandledTask: (taskId: string) => handledTaskIds.has(taskId),

    markTaskHandled: (taskId: string) => {
        rememberHandledTaskId(taskId);
        diagnosticLog('event-service', 'task-marked-handled', {
            taskId,
            pendingEventCount: pendingEvents.size,
        });
        EventService.consumeTaskCompletedEvent(taskId);
    }
};
