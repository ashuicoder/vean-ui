import type { Component } from 'vue';
import { render } from 'vitest-browser-vue';

export interface RenderOptions {
  props?: Record<string, unknown>;
  slots?: Record<string, unknown>;
}

/**
 * Render an aria component into the real browser DOM using `vitest-browser-vue`.
 *
 * No theme wrapper: `@vean/aria` carries zero styles by design, so there is
 * nothing to inject. Anything that needs computed styles (color contrast,
 * geometry) belongs to the ui tier, not this one.
 *
 * Use `page` / `userEvent` from `vitest/browser` for locators and interactions,
 * and `expect.element(locator)` for retryable assertions.
 */
export function renderAria<T extends Component>(component: T, options: RenderOptions = {}) {
  const { props, slots } = options;

  return render(component, { props, slots } as Parameters<typeof render<T>>[1]);
}
