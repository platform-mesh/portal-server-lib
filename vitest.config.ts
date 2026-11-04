import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.spec.ts'],
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'cobertura', 'lcov'],
      reportsDirectory: 'test-run-reports/coverage/unit',
      thresholds: {
        branches: 75,
        functions: 89,
        lines: 90,
        statements: -12,
      },
    },
  },
});
