import { describe, expect, it } from 'vitest';
import { defineComponent, nextTick } from 'vue';
import { page, userEvent } from 'vitest/browser';
import { renderAria } from '../shared/render';
import { SelectCompact } from '../../../src/components/select';

/**
 * The aria-only contract this file guards is the controlled/uncontrolled
 * arbitration in `useControllableState` as reached through
 * `useSelection` → `SelectRoot` → `SelectCompact`:
 *
 * - With no `modelValue` (uncontrolled), a pick updates the trigger text and
 *   emits `update:modelValue` once. Selection must commit even though the
 *   parent never writes the value back.
 * - With `modelValue` bound (controlled) and the parent ignoring the update, the
 *   trigger must NOT drift to the new label: the prop is the only source of
 *   truth. This is the case the ui e2e suite cannot cover, because `SSelect`
 *   tests always drive the value back through their own state.
 * - Writing the prop from the parent takes effect without remounting.
 *
 * Browser mode matters here beyond "nicer DOM": the trigger only opens on a
 * real `pointerdown` with `button === 0`, rejects `pointerType === 'touch'`, and
 * calls `releasePointerCapture` — none of which happy-dom reproduces.
 */
const items = [
  { label: 'Apple', value: 'apple' },
  { label: 'Banana', value: 'banana' },
  { label: 'Orange', value: 'orange' }
];

describe('SelectCompact controlled / uncontrolled (browser)', () => {
  it('commits the selection and emits once when uncontrolled', async () => {
    const updates: unknown[] = [];

    const { unmount } = await renderAria(SelectCompact, {
      props: {
        items,
        placeholder: 'Pick fruit',
        'onUpdate:modelValue': (value: unknown) => updates.push(value)
      }
    });

    const trigger = page.getByRole('combobox');
    await userEvent.click(trigger);
    await expect.element(page.getByRole('listbox')).toBeVisible();

    await userEvent.click(page.getByRole('option', { name: 'Banana' }));

    await expect.element(trigger).toHaveTextContent('Banana');
    expect(updates).toEqual(['banana']);

    unmount();
  });

  it('does not drift to the picked label when controlled and the parent ignores the update', async () => {
    const updates: unknown[] = [];

    const { unmount } = await renderAria(SelectCompact, {
      props: {
        items,
        placeholder: 'Pick fruit',
        modelValue: 'apple',
        'onUpdate:modelValue': (value: unknown) => updates.push(value)
      }
    });

    const trigger = page.getByRole('combobox');
    await expect.element(trigger).toHaveTextContent('Apple');

    await userEvent.click(trigger);
    await expect.element(page.getByRole('listbox')).toBeVisible();
    await userEvent.click(page.getByRole('option', { name: 'Banana' }));

    // The pick is reported to the parent ...
    expect(updates).toEqual(['banana']);

    // ... and the visible state stays on the prop value, because the parent never
    // wrote it back. A component that kept its own copy would already read 'Banana'.
    await expect.element(trigger).toHaveTextContent('Apple');

    unmount();
  });

  it('follows the prop when the parent writes it back', async () => {
    // An options component with a template keeps the generic `SelectCompactProps<T, M>`
    // out of the test: `h(SelectCompact, …)` cannot infer `T` from a plain object
    // literal, so the render-function form needs an explicit generic argument that
    // adds nothing to what this test asserts.
    const Controlled = defineComponent({
      name: 'ControlledSelect',
      components: { SelectCompact },
      data: () => ({ items, value: 'apple' }),
      template: `
        <SelectCompact
          :items="items"
          placeholder="Pick fruit"
          :model-value="value"
          @update:model-value="value = $event"
        />
      `
    });

    const { unmount } = await renderAria(Controlled);
    const trigger = page.getByRole('combobox');

    await expect.element(trigger).toHaveTextContent('Apple');

    await userEvent.click(trigger);
    await expect.element(page.getByRole('listbox')).toBeVisible();
    await userEvent.click(page.getByRole('option', { name: 'Orange' }));

    await expect.element(trigger).toHaveTextContent('Orange');

    unmount();
  });

  it('keeps the generated content id stable across open cycles', async () => {
    const { unmount } = await renderAria(SelectCompact, {
      props: { items, placeholder: 'Pick fruit' }
    });

    const trigger = page.getByRole('combobox');
    const initialId = trigger.element().getAttribute('aria-controls');
    expect(initialId).toBeTruthy();

    await userEvent.click(trigger);
    await expect.element(page.getByRole('listbox')).toBeVisible();

    // `contentId` is produced by `useId` + `initContentId`, which only ever writes
    // once. A regenerated id would break `aria-controls` → listbox wiring for
    // assistive tech that cached the first value.
    expect(trigger.element().getAttribute('aria-controls')).toBe(initialId);
    expect(page.getByRole('listbox').element().id).toBe(initialId);

    await userEvent.keyboard('{Escape}');
    await expect.element(page.getByRole('listbox')).not.toBeInTheDocument();

    await nextTick();
    expect(trigger.element().getAttribute('aria-controls')).toBe(initialId);

    unmount();
  });
});
