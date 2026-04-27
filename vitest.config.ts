import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./lib/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.ts'],
      exclude: ['lib/__tests__/**'],
      all: true,
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
