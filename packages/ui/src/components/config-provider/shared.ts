import { DEFAULT_OPTIONS, darkClassName, resolveDocumentColorScheme } from '@vean/theme';
import type { DarkSelectorValue, ThemeMode, ThemeOptions, ThemeOverrides } from '@vean/theme';
import type { ThemeEnvelopeInput } from '@vean/theme/storage';
import type { ThemePresetColors, ThemePresetInput, ThemeSettingsState } from '@/theme';
import type { ConfigProviderThemeOptions } from './types';

/**
 * Pure theme helpers for `SConfigProvider`.
 *
 * Everything here is a plain function of its arguments: no `ref`, no lifecycle,
 * no component scope. The composables in `use-theme.ts` own the reactive state
 * and hand it in, which is what keeps the merge rules ("prop → state → default")
 * readable and individually testable.
 */

/**
 * `*{transition:none}` injected for exactly one reflow while the dark class
 * flips. Without it a component carrying `transition-all` (a button, say) fades
 * its colors 150ms late against a background that already switched.
 */
const TRANSITION_SUPPRESS_CSS =
  '*,*::before,*::after{-webkit-transition:none!important;-moz-transition:none!important;-o-transition:none!important;-ms-transition:none!important;transition:none!important}';

/**
 * whether a preset input is an inline color preset (mode-split, carries
 * `light`). A reference-only input carries just `name` and no `light`.
 */
export function isInlineColorPreset(preset: ThemePresetInput | undefined): preset is ThemePresetColors {
  return !!preset && 'light' in preset;
}

/**
 * Merge a persisted envelope into the settings state.
 *
 * Only what the envelope actually carried lands here — engine defaults are NOT
 * injected, because `resolveThemeOptions` already falls back per field at read
 * time. Pre-filling them would make the state shadow every lower-priority
 * source (that is how the deprecated `size` prop became dead code).
 */
export function mergePersistedState(envelope: ThemeEnvelopeInput | null): ThemeSettingsState {
  return {
    ...envelope?.options,
    ...(envelope?.mode ? { mode: envelope.mode } : {})
  };
}

/**
 * Replace the state in place, dropping fields the incoming state lacks.
 *
 * `Object.assign` keeps keys it is not given, which makes absence ambiguous: an
 * envelope written after "clear all overrides" carries no `overrides` key (JSON
 * drops `undefined`), so assign leaves the previous tag's overrides in place and
 * the clear never propagates. Deleting the stale keys first is what makes the
 * absence mean "unset" rather than "unchanged".
 */
export function replaceState(target: ThemeSettingsState, next: ThemeSettingsState): void {
  for (const key of Object.keys(target) as (keyof ThemeSettingsState)[]) {
    if (!(key in next)) {
      delete target[key];
    }
  }

  Object.assign(target, next);
}

/** Materialize a preset's colors as the engine's `overrides` payload. */
export function presetToOverrides(preset: ThemePresetColors | undefined): ThemeOverrides | undefined {
  if (!preset) {
    return undefined;
  }

  return {
    light: preset.light,
    ...(preset.dark ? { dark: preset.dark } : {})
  };
}

/** Input of `resolvePresetColors`. */
export interface ResolvePresetInput {
  /** the `theme.preset` prop: inline colors, or a `{ name }` reference. */
  presetInput?: ThemePresetInput;
  /** the name committed through `applyPreset` / `savePreset`. */
  appliedName: string | null;
  /** whether the provider is allowed to read the persisted envelope. */
  persist: boolean;
  isServer: boolean;
  /** the in-memory preset table (client). */
  presets: Record<string, ThemePresetColors>;
  /** the app-registered resolver used during SSR. */
  presetProvider?: (name: string) => ThemePresetColors | null | undefined;
}

/**
 * Resolve the colors of the preset that should be applied, or `undefined` when
 * the built-in palette is what renders.
 *
 * Resolution order: an inline `theme.preset` (self-contained, always wins), then
 * the name from `theme.preset` or the applied preset. A named reference is only
 * resolvable when persistence is on — that is where the preset table lives — and
 * it resolves through the injected provider on the server, the memory table on
 * the client.
 */
export function resolvePresetColors(input: ResolvePresetInput): ThemePresetColors | undefined {
  const { presetInput, appliedName, persist, isServer, presets, presetProvider } = input;

  if (isInlineColorPreset(presetInput)) {
    return presetInput;
  }

  const name = presetInput?.name ?? appliedName;

  if (!name || !persist) {
    return undefined;
  }

  const preset = isServer ? (presetProvider?.(name) ?? undefined) : presets[name];

  if (!preset && isServer) {
    // a missing preset on the server is a real defect: the client resolves it
    // from its own table, so SSR and hydration would disagree on the palette.
    console.warn(`[SConfigProvider] theme preset "${name}" not found, falling back to built-in colors.`);
  }

  return preset;
}

/** Input of `resolveThemeOptions`. */
export interface ResolveThemeOptionsInput {
  /** the `theme` prop. */
  propTheme?: ConfigProviderThemeOptions;
  /** the provider's persistable state. */
  state: ThemeSettingsState;
  /** the resolved preset colors, if any. */
  preset?: ThemePresetColors;
}

/**
 * Compose the effective engine options.
 *
 * Precedence is per field: the `theme` prop (explicit caller intent), then the
 * provider state (persisted or committed), then the engine default. `overrides`
 * prefers an explicit `overrides` over a preset's colors, so a caller can always
 * hand-pick tokens on top of a preset.
 */
export function resolveThemeOptions(input: ResolveThemeOptionsInput): ThemeOptions {
  const { propTheme: themeProp = {}, state, preset } = input;

  return {
    base: themeProp.base ?? state.base ?? DEFAULT_OPTIONS.base,
    primary: themeProp.primary ?? state.primary ?? DEFAULT_OPTIONS.primary,
    feedback: themeProp.feedback ?? state.feedback,
    overrides: themeProp.overrides ?? state.overrides ?? presetToOverrides(preset),
    size: themeProp.size ?? state.size ?? DEFAULT_OPTIONS.size,
    radius: themeProp.radius ?? state.radius ?? DEFAULT_OPTIONS.radius,
    spacing: themeProp.spacing ?? state.spacing,
    // 字体族：引擎的三条 `--font-*` 字面量，改一只影响字族栈
    font: themeProp.font ?? state.font,
    format: themeProp.format ?? state.format,
    surfaceStyle: themeProp.surfaceStyle ?? state.surfaceStyle,
    borderOpacity: themeProp.borderOpacity ?? state.borderOpacity,
    // token 命名空间：`false` 是默认（与 shadcn 同名），字符串则给所有变量加前缀。
    // 漏掉这一项会让宿主的 prefix 选项静默失效：解析与发射必须同值。
    prefix: themeProp.prefix ?? state.prefix ?? DEFAULT_OPTIONS.prefix,
    styleTarget: themeProp.styleTarget ?? state.styleTarget,
    darkSelector: themeProp.darkSelector ?? state.darkSelector
  };
}

/**
 * Push a resolved mode onto the document: the inline `color-scheme` and the dark
 * class, with CSS transitions suppressed for the flip.
 *
 * `color-scheme` must be written here and not only via the class: the first-paint
 * script sets it as an **inline style** on `<html>`, and an inline style outranks
 * every selector — toggling only the class leaves the stale inline value winning
 * inside the `.dark` block, so UA-drawn surfaces (scrollbars, form controls,
 * canvas) stay light. Both writers go through `resolveDocumentColorScheme`, so
 * they agree by construction.
 *
 * Class precedence comes from `darkSelector`: `media` toggles nothing (the media
 * query already follows the OS), `class` toggles `dark`, any other selector is
 * used verbatim.
 */
export function syncDocumentMode(mode: ThemeMode, darkSelector: DarkSelectorValue): void {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.style.colorScheme = resolveDocumentColorScheme(mode, darkSelector);

  const darkClass = darkClassName(darkSelector);

  if (!darkClass) {
    return;
  }

  // 复刻 @vueuse/core useColorMode 的 disableTransition 手法：
  // 注入 `*{transition:none!important}` → 切 class → 强制 reflow → 移除
  const suppressTransitions = document.createElement('style');

  suppressTransitions.appendChild(document.createTextNode(TRANSITION_SUPPRESS_CSS));
  document.head.appendChild(suppressTransitions);

  document.documentElement.classList.toggle(darkClass, mode === 'dark');

  // 强制浏览器同步重算样式，确保禁用过渡的规则在 class 切换前生效
  void window.getComputedStyle(suppressTransitions).opacity;
  document.head.removeChild(suppressTransitions);
}
