import AsyncStorage from '@react-native-async-storage/async-storage';
import type { EventPayload } from './eventService';

export type StoredBackgroundEvent = {
    eventName: string;
    payload?: EventPayload;
};

const pendingBackgroundEventsKey = 'pendingBackgroundEvents';

function parseStoredEvents(value: string | null): StoredBackgroundEvent[] {
    if (!value) {
        return [];
    }

    try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed.filter((event): event is StoredBackgroundEvent =>
            event &&
            typeof event === 'object' &&
            typeof event.eventName === 'string'
        );
    } catch (error) {
        console.warn('background-events: parse failed', error);
        return [];
    }
}

// Serializes the read-modify-write cycle so concurrent adds cannot drop
// each other's events (background notifications arrive serialized in
// practice, but the guarantee should not depend on that).
let pendingWrite: Promise<unknown> = Promise.resolve();

export function addPendingBackgroundEvent(
    eventName: string,
    payload?: EventPayload
): Promise<void> {
    const write = pendingWrite.then(async () => {
        const currentEvents = parseStoredEvents(
            await AsyncStorage.getItem(pendingBackgroundEventsKey)
        );
        const nextEvents = currentEvents.filter(event => event.eventName !== eventName);

        nextEvents.push({ eventName, payload });

        await AsyncStorage.setItem(
            pendingBackgroundEventsKey,
            JSON.stringify(nextEvents)
        );
    });

    pendingWrite = write.catch(() => undefined);
    return write;
}

export async function takePendingBackgroundEvents(): Promise<StoredBackgroundEvent[]> {
    const currentEvents = parseStoredEvents(
        await AsyncStorage.getItem(pendingBackgroundEventsKey)
    );

    if (currentEvents.length > 0) {
        await AsyncStorage.removeItem(pendingBackgroundEventsKey);
    }

    return currentEvents;
}
