import vue from '@vitejs/plugin-vue';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

/**
 * Browser-mode config for `@vean/aria` — loaded explicitly via
 * `vitest --config vitest.browser.config.ts`.
 *
 * This file is intentionally NOT named `vitest.config.ts`: `packages/aria/vite.config.ts`
 * is also the build config (it carries the `pack` field), and Vitest must not
 * auto-discover a second test config next to it. This mirrors the ui package's
 * `packages/ui/vitest.browser.config.ts`.
 *
 * Uses `defineConfig` from `vitest/config` (not `vite-plus`) because this is a
 * test-only config and must not carry the `pack` field.
 *
 * Run with `pnpm --filter @vean/aria test:browser`.
 *
 * Why aria needs its own browser tier instead of leaning on the ui e2e suite:
 * the ui suite exercises styled `S*` wrappers, so it only reaches aria behaviour
 * that the wrapper happens to surface. The aria-only contracts below are not
 * reachable from any wrapper and have no other guard:
 *
 * - `useId`-derived ids (`contentId`, `aria-controls`) staying stable across
 *   SSR/hydration and across re-renders,
 * - controlled (`modelValue`) vs uncontrolled (`defaultValue`) arbitration,
 * - `aria-*` correctness in nested popups, which depend on real `Teleport`
 *   ordering and real focus management.
 */
export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    include: ['test/browser/**/*.browser.spec.ts'],
    setupFiles: ['./test/browser/setup.ts'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }]
    }
  }
});
