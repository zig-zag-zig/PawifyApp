import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-file-system', () => ({
    File: class {
        uri = '';
        exists = false;
        size = 0;
        delete = vi.fn();
        constructor(...args: any[]) { }
    },
    Paths: { cache: { uri: 'file:///tmp' } },
}));

vi.mock('../../config/env', () => ({
    ENV: { imageCacheTimeoutMaxRetries: 3, imageCacheTimeoutRetryBaseDelayMs: 300 },
}));

vi.mock('../../utils/diagnostics', () => ({
    describeError: vi.fn(() => ({})),
    diagnosticLog: vi.fn(),
    diagnosticWarn: vi.fn(),
    elapsedSince: vi.fn(() => 1),
    shortenString: vi.fn((s: string) => s),
}));

describe('getCacheKeyFromUrl', () => {
    async function loadModule() {
        const mod = await import('./cachedImageFileCache');
        return mod.getCacheKeyFromUrl;
    }

    it('returns consistent hash for same URL', async () => {
        const fn = await loadModule();
        const url = 'https://example.com/image.jpg';
        expect(fn(url)).toBe(fn(url));
    });

    it('returns a prefixed cache key', async () => {
        const fn = await loadModule();
        const key = fn('https://example.com/image.jpg');
        expect(key).toMatch(/^expo-cached-image-[a-f0-9]{8}$/);
    });

    it('returns null for null', async () => {
        const fn = await loadModule();
        expect(fn(null)).toBeNull();
    });

    it('returns null for undefined', async () => {
        const fn = await loadModule();
        expect(fn(undefined)).toBeNull();
    });

    it('returns null for empty string', async () => {
        const fn = await loadModule();
        expect(fn('')).toBeNull();
    });

    it('produces different keys for different URLs', async () => {
        const fn = await loadModule();
        const key1 = fn('https://example.com/image1.jpg');
        const key2 = fn('https://example.com/image2.jpg');
        expect(key1).not.toBe(key2);
    });
});
