// Shared test setup loaded once per test file via vitest.config.ts setupFiles.
// This file runs before any test code, so mocks here apply globally.

// Silence known noisy warnings during tests.
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
    const message = args.map(String).join(' ');
    // Suppress expected warnings from mocked native modules.
    if (
        message.includes('NativeModule:') ||
        message.includes('expo-file-system') ||
        message.includes('firebase')
    ) {
        return;
    }
    originalWarn(...args);
};
