import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      thresholds: {
        // The engine is arithmetic; there is no excuse for untested branches.
        lines: 85,
        functions: 85,
        branches: 80,
      },
    },
  },
});
