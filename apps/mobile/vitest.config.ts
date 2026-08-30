import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  define: {
    __DEV__: 'false',
  },
  resolve: {
    alias: {
      // vitest ignores Metro's "react-native" main-field convention; alias the
      // exact TS entry file so runtime imports never need a shared dist build.
      '@pawify/shared': path.resolve(__dirname, '../../packages/shared/index.ts'),
    },
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
        'src/test/**',
        'src/**/*.test.{ts,tsx}',
      ],
    },
  },
});
