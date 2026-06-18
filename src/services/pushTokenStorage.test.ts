import { describe, expect, it, vi, beforeEach } from 'vitest';

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

describe('pushTokenStorage', () => {
    beforeEach(() => {
        storage = {};
    });

    async function loadModule() {
        const mod = await import('./pushTokenStorage');
        return mod;
    }

    it('getStoredPushToken returns null when not set', async () => {
        const { getStoredPushToken } = await loadModule();
        expect(await getStoredPushToken()).toBeNull();
    });

    it('setStoredPushToken persists a value', async () => {
        const { getStoredPushToken, setStoredPushToken } = await loadModule();
        await setStoredPushToken('token-abc');
        expect(await getStoredPushToken()).toBe('token-abc');
    });

    it('removeStoredPushToken clears the value', async () => {
        const { getStoredPushToken, setStoredPushToken, removeStoredPushToken } = await loadModule();
        await setStoredPushToken('token-abc');
        await removeStoredPushToken();
        expect(await getStoredPushToken()).toBeNull();
    });
});
