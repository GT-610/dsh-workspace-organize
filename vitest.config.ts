import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/** Absolute path of a file in this repository, for alias targets. */
const here = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url))

/**
 * Unit and component tests.
 *
 * `src/client/select.ts` and the shared contract need no DOM. The component
 * test mounts the registered browser in jsdom against a double for the shipped
 * primitives — see tests/stubs/primitives.tsx for why that substitution is
 * necessary rather than a convenience.
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@deepseek-ai\/dsh-client-ui-primitives$/, replacement: here('./tests/stubs/primitives.tsx') },
    ],
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'],
    restoreMocks: true,
  },
})
