import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __DEV__: 'false',
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts'],
    globals: true,
    coverage: {
      provider: 'v8',
      thresholds: {
        statements: 68,
        branches: 58,
        functions: 63,
        lines: 68,
      },
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/modules/**',
        'src/test/**',
        'src/**/*.test.{ts,tsx}',
      ],
    },
  },
});
