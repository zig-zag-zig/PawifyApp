import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
    Linking: {
        openURL: vi.fn(async () => { }),
    },
}));

describe('externalNavigation', () => {
    afterEach(() => {
        vi.resetModules();
        vi.useRealTimers();
    });

    async function loadModule() {
        return import('./externalNavigation');
    }

    describe('getExternalNavigationResumeDelayMs', () => {
        it('returns 0 when no recent navigation', async () => {
            const { getExternalNavigationResumeDelayMs } = await loadModule();
            expect(getExternalNavigationResumeDelayMs()).toBe(0);
        });

        it('returns delay after openExternalUrl within window', async () => {
            vi.useFakeTimers();
            const { openExternalUrl, getExternalNavigationResumeDelayMs } = await loadModule();
            await openExternalUrl('https://example.com');
            const delay = getExternalNavigationResumeDelayMs();
            expect(delay).toBeGreaterThan(0);
        });

        it('returns 0 when inactive period exceeds window', async () => {
            vi.useFakeTimers();
            const now = new Date('2025-01-01T00:00:00Z').getTime();
            vi.setSystemTime(now);

            const { openExternalUrl, getExternalNavigationResumeDelayMs } = await loadModule();
            await openExternalUrl('https://example.com');

            // Move past the 5-minute window
            vi.setSystemTime(now + 6 * 60 * 1000);
            expect(getExternalNavigationResumeDelayMs()).toBe(0);
        });

        it('stagger increases delay with each call', async () => {
            vi.useFakeTimers();
            const now = new Date('2025-01-01T00:00:00Z').getTime();
            vi.setSystemTime(now);

            const { openExternalUrl, getExternalNavigationResumeDelayMs } = await loadModule();
            await openExternalUrl('https://example.com');

            const delay1 = getExternalNavigationResumeDelayMs({ stagger: true, staggerStepMs: 100 });
            const delay2 = getExternalNavigationResumeDelayMs({ stagger: true, staggerStepMs: 100 });
            expect(delay2).toBeGreaterThan(delay1);
        });

        it('stagger caps at maxStaggerMs', async () => {
            vi.useFakeTimers();
            const now = new Date('2025-01-01T00:00:00Z').getTime();
            vi.setSystemTime(now);

            const { openExternalUrl, getExternalNavigationResumeDelayMs } = await loadModule();
            await openExternalUrl('https://example.com');

            // Make many calls to exceed max stagger
            let delay = 0;
            for (let i = 0; i < 100; i++) {
                delay = getExternalNavigationResumeDelayMs({
                    stagger: true,
                    staggerStepMs: 100,
                    maxStaggerMs: 500,
                });
            }
            // The stagger portion should not exceed 500
            const baseDelay = getExternalNavigationResumeDelayMs();
            expect(delay - baseDelay).toBeLessThanOrEqual(500);
        });
    });
});
