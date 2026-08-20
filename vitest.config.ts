// Vitest configuration enforcing Article V's three-layer test separation as two isolated projects.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

/** Article V: a unit test is 100% mocked and must complete in under 10ms. */
const UNIT_TEST_TIMEOUT_MS = 10

/** Integration tests boot a real PostgreSQL container, which is not fast. */
const INTEGRATION_TEST_TIMEOUT_MS = 120_000

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': resolve(__dirname, '.') },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
          environment: 'happy-dom',
          // Pays one-time runtime costs (ICU locale data) outside the budget.
          setupFiles: ['tests/unit/setup.ts'],
          // A unit test that exceeds this budget is not a unit test. Failing here
          // is the intended outcome — the test belongs in the integration layer.
          testTimeout: UNIT_TEST_TIMEOUT_MS,
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          testTimeout: INTEGRATION_TEST_TIMEOUT_MS,
          hookTimeout: INTEGRATION_TEST_TIMEOUT_MS,
          setupFiles: ['tests/integration/setup.ts'],
          // One container for the whole run, prepared once. Nine simultaneous
          // Postgres instances exhausted connections and threw ECONNRESET
          // mid-suite, which reads exactly like a real failure and is not one.
          globalSetup: ['tests/integration/global-setup.ts'],
          fileParallelism: false,
        },
      },
    ],
  },
})
