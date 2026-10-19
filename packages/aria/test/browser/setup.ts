/**
 * Browser-mode setup for `@vean/aria` — runs once per browser spec file.
 *
 * Deliberately near-empty, for the same reason `packages/ui/test/browser/setup.ts`
 * is near-empty: the whole point of the browser tier is to exercise the real
 * platform APIs that the happy-dom tier has to mock. No `fetch` mock, no
 * `ResizeObserver` / pointer-capture / `scrollIntoView` shims.
 *
 * Nothing is imported from `@vean/ui` here — aria must never depend on the styled
 * package, and this setup file keeps that true even for tests.
 *
 * `vitest-browser-vue` registers its own `afterEach` cleanup that unmounts the
 * previously rendered component, so per-test teardown is automatic.
 */
export {};
