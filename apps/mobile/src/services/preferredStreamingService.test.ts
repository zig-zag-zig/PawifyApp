import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadPreferredStreamingService, savePreferredStreamingService } from './preferredStreamingService';

const storage = vi.hoisted(() => {
    let value: string | null = null;
    return {
        getItem: vi.fn(async () => value),
        setItem: vi.fn(async (_key: string, next: string) => { value = next; }),
        removeItem: vi.fn(async () => { value = null; }),
        reset: () => { value = null; },
    };
});

vi.mock('@react-native-async-storage/async-storage', () => ({ default: storage }));

afterEach(() => {
    storage.reset();
    vi.clearAllMocks();
});

describe('preferredStreamingService', () => {
    it('persists supported services', async () => {
        await savePreferredStreamingService('spotify');
        expect(await loadPreferredStreamingService()).toBe('spotify');
    });

    it('rejects unsupported stored values', async () => {
        storage.getItem.mockResolvedValueOnce('not-a-service');
        expect(await loadPreferredStreamingService()).toBeNull();
    });

    it('removes the preference when cleared', async () => {
        await savePreferredStreamingService('spotify');
        await savePreferredStreamingService(null);
        expect(await loadPreferredStreamingService()).toBeNull();
    });
});
