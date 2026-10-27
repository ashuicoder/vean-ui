import { computed, onUnmounted, reactive, ref, watch } from 'vue';
import type { ComputedRef, Ref, ShallowRef, WritableComputedRef } from 'vue';
import { useContext } from '@vean/aria/composables';
import { DEFAULT_OPTIONS } from '@vean/theme';
import type {
  PaletteKey,
  ThemeMode,
  ThemeModePreference,
  ThemeOptions,
  ThemeRadiusValue,
  ThemeSizeValue,
  ThemeSpacingValue
} from '@vean/theme';
import { isServerRuntime } from '@vean/theme/ssr';
import { readThemeEnvelope } from '@vean/theme/storage';
import type { ThemeEnvelopeInput } from '@vean/theme/storage';
import type { ThemePresetColors, ThemeSettingsState } from '@/theme';
import {
  mergePersistedState,
  replaceState,
  resolvePresetColors,
  resolveThemeOptions,
  syncDocumentMode
} from './shared';
import type { ConfigProviderProps } from './types';

/**
 * The reactive theme context exposed by `SConfigProvider`.
 *
 * It owns the persistable theme state (`base` / `primary` / `radius` / `size` /
 * `spacing` / `mode`), the custom preset management, and the effective `theme`
 * derived for the provider. Consumers read it via `useTheme()` to drive their own
 * theme UI without prop drilling or app-level state stores.
 */
export interface ThemeContext {
  /** The base color palette key. */
  base: WritableComputedRef<PaletteKey>;
  /** The primary color palette key. */
  primary: WritableComputedRef<PaletteKey>;
  /** The border radius. */
  radius: WritableComputedRef<ThemeRadiusValue>;
  /** The component size / density. */
  size: WritableComputedRef<ThemeSizeValue>;
  /** The spacing grid unit multiplier (padding / margin / gap). */
  spacing: WritableComputedRef<ThemeSpacingValue>;
  /** The color scheme preference (`light` / `dark` / `auto`). */
  mode: WritableComputedRef<ThemeModePreference>;
  /** The effective (resolved) color scheme: `auto` follows the OS preference. */
  effectiveMode: ComputedRef<ThemeMode>;
  /** Set the border radius. */
  setRadius: (value: ThemeRadiusValue) => void;
  /** Set the component size / density. */
  setSize: (value: ThemeSizeValue) => void;
  /** Set the spacing grid unit multiplier. */
  setSpacing: (value: ThemeSpacingValue) => void;
  /** Set the color scheme preference. */
  setMode: (value: ThemeModePreference) => void;
  /** The persisted custom theme presets table. */
  customPresets: Ref<Record<string, ThemePresetColors>>;
  /** The currently applied custom preset name, if any. */
  appliedPresetName: ShallowRef<string | null>;
  /**
   * The application's own config carried by the persisted envelope.
   *
   * Read-only view: the provider owns the write (see `getExtraTheme` / the
   * `onExtraThemeChange` prop on `SConfigProvider`), so nothing here can race the
   * single writer.
   */
  extra: Ref<Record<string, unknown>>;
  /** Save the current primary color as a custom preset. */
  savePreset: (name: string) => boolean;
  /** Remove a custom preset. */
  removePreset: (name: string) => boolean;
  /** Apply a custom preset by name. */
  applyPreset: (name: string) => void;
  /** Clear the applied custom preset. */
  resetPreset: () => void;
  /** Overwrite the full persistable theme state (options + mode). */
  setThemeState: (config: ThemeSettingsState) => void;
  /** The effective theme merged from the internal state and the `theme` prop. */
  theme: ComputedRef<ThemeOptions>;
}

export const [provideThemeContext, useThemeConsumer] = useContext<ThemeContext>('UiThemeContext');

export const useTheme = (consumerName?: string | null, defaultValue?: ThemeContext) =>
  useThemeConsumer(consumerName ?? 'ThemeConsumer', defaultValue);

/** The internal theme context held by `SConfigProvider` (adds storage helpers). */
export type ConfigProviderThemeContext = ThemeContext & {
  /**
   * Re-read the persisted envelope (options / mode / presets / applied preset)
   * from storage and apply it (cross-tab sync).
   */
  refreshThemeConfig: () => void;
};

/** The persisted source a fresh provider starts from, if any. */
function readPersistedTheme(props: ConfigProviderProps, isServer: boolean): ThemeEnvelopeInput | null {
  if (!props.persistTheme) {
    return null;
  }

  // 显式注入的 themeConfig（SSR）优先，避免读取 localStorage
  if (props.themeConfig) {
    return props.themeConfig;
  }

  // 服务端没有 localStorage：首帧由内联脚本（createThemeInitScript）在客户端应用
  return isServer ? null : readThemeEnvelope();
}

/**
 * Expose one field of the shared state as a writable computed.
 *
 * The getter falls back per field, so the state may hold only what was actually
 * persisted (see `mergePersistedState`) — that is what keeps every lower-priority
 * source, such as the deprecated `size` prop, reachable.
 */
function createStateField<K extends keyof typeof DEFAULT_OPTIONS>(
  state: ThemeSettingsState,
  key: K
): WritableComputedRef<NonNullable<ThemeSettingsState[K]>> {
  return computed({
    get: () => (state[key] ?? DEFAULT_OPTIONS[key]) as NonNullable<ThemeSettingsState[K]>,
    set: value => {
      state[key] = value;
    }
  });
}

/** Track the OS dark preference. `null` on the server, where `matchMedia` does not exist. */
function createSystemDarkQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return null;
  }

  return window.matchMedia('(prefers-color-scheme: dark)');
}

/**
 * Create the theme context for a `SConfigProvider` instance.
 *
 * The persistable theme state is initialized once from the persisted source
 * (the injected `themeConfig` on the server, the theme envelope on the client)
 * and kept in sync on every change, so the theme survives across refreshes and
 * matches between server and client rendering.
 *
 * **Persistence**: the context itself writes nothing — the provider's single
 * envelope writer (see `useConfigProviderTheme`) watches the derived state and
 * owns every write to the one storage key.
 */
export function createThemeContext(props: ConfigProviderProps): ConfigProviderThemeContext {
  const isServer = props.isServer ?? isServerRuntime();
  const persisted = readPersistedTheme(props, isServer);

  // —— 持久化状态：单一 reactive 源，字段逐个以可写 computed 暴露 ——
  const themeState = reactive<ThemeSettingsState>(mergePersistedState(persisted));

  const base = createStateField(themeState, 'base');
  const primary = createStateField(themeState, 'primary');
  const radius = createStateField(themeState, 'radius');
  const size = createStateField(themeState, 'size');
  const spacing = createStateField(themeState, 'spacing');
  // `mode` 不是引擎选项：DEFAULT_OPTIONS 里没有它，单独回落 `light`。
  // JSON 会丢掉 undefined 字段，所以持久化信封里不会出现缺失的 mode。
  const mode = computed<ThemeModePreference>({
    get: () => themeState.mode ?? 'light',
    set: value => {
      themeState.mode = value;
    }
  });

  // —— auto 模式的系统偏好解析：跟踪 `prefers-color-scheme`，SSR 下无
  //    matchMedia 时回退为 light，首帧由 createThemeInitScript 在浏览器处理 ——
  const systemDarkQuery = createSystemDarkQuery();
  const systemDark = ref(systemDarkQuery?.matches ?? false);

  const onSystemColorChange = (event: MediaQueryListEvent): void => {
    systemDark.value = event.matches;
  };

  systemDarkQuery?.addEventListener('change', onSystemColorChange);

  onUnmounted(() => {
    systemDarkQuery?.removeEventListener('change', onSystemColorChange);
  });

  /** `auto` 解析为系统偏好；显式 `light` / `dark` 原样返回 */
  const effectiveMode = computed<ThemeMode>(() =>
    mode.value === 'auto' ? (systemDark.value ? 'dark' : 'light') : mode.value
  );

  // —— 自定义 preset（随主题信封持久化；persistTheme 关闭时仅内存态）——
  const customPresets = ref<Record<string, ThemePresetColors>>(
    (persisted?.presets as Record<string, ThemePresetColors> | undefined) ?? {}
  );
  const appliedPresetName = ref<string | null>(persisted?.appliedPreset ?? null);
  const extra = ref<Record<string, unknown>>(persisted?.extra ?? {});

  // —— 有效主题：显式 theme prop 覆盖内部状态 ——
  const theme = computed<ThemeOptions>(() =>
    resolveThemeOptions({
      propTheme: props.theme,
      state: themeState,
      preset: resolvePresetColors({
        presetInput: props.theme?.preset,
        appliedName: appliedPresetName.value,
        persist: !!props.persistTheme,
        isServer,
        presets: customPresets.value,
        presetProvider: props.presetProvider
      })
    })
  );

  const activeDarkSelector = computed(() => theme.value.darkSelector ?? DEFAULT_OPTIONS.darkSelector);

  const savePreset = (name: string): boolean => {
    const preset: ThemePresetColors = {
      light: { primary: `${primary.value}.600`, ring: `${primary.value}.500` },
      dark: { primary: `${primary.value}.400`, ring: `${primary.value}.300` }
    };

    customPresets.value = { ...customPresets.value, [name]: preset };
    appliedPresetName.value = name;

    return true;
  };

  const removePreset = (name: string): boolean => {
    if (!(name in customPresets.value)) {
      return false;
    }

    const { [name]: _removed, ...remaining } = customPresets.value;

    customPresets.value = remaining;

    if (appliedPresetName.value === name) {
      appliedPresetName.value = null;
    }

    return true;
  };

  /**
   * 跨标签页同步：另开标签页写入主题信封后重读并应用到内存状态 ——
   * options / mode / presets / applied preset / extra 一起刷新，`theme` 随之重派生。
   * 读不到信封（被清空 / 无权访问）时不改动任何状态。`themeConfig` 注入（SSR）时不重读。
   *
   * `Object.assign` 不够：`JSON.stringify` 丢掉 `undefined` 字段，所以「清除
   * override」写出的信封里没有 `overrides`，而目标标签页的旧值会残留。整体替换
   * 才会让信封的缺席真正等于清除。
   */
  const refreshThemeConfig = (): void => {
    if (!props.persistTheme || props.themeConfig) {
      return;
    }

    const envelope = readThemeEnvelope();

    if (!envelope) {
      return;
    }

    replaceState(themeState, mergePersistedState(envelope));
    customPresets.value = (envelope.presets as Record<string, ThemePresetColors> | undefined) ?? {};
    appliedPresetName.value = envelope.appliedPreset ?? null;
    // 整体替换：信封里缺席的 extra 等于「应用已清空」
    extra.value = envelope.extra ?? {};
  };

  // —— 暗色模式 class + color-scheme 同步（首帧前由 createThemeInitScript 应用，
  //    此处幂等并负责运行中切换）。监听解析后的 darkSelector：持久化状态里改了
  //    选择器口径时也要重新对齐，而不是一直沿用挂载时的 prop。
  watch([effectiveMode, activeDarkSelector], ([value, darkSelector]) => syncDocumentMode(value, darkSelector), {
    immediate: true
  });

  return {
    base,
    primary,
    radius,
    size,
    spacing,
    mode,
    effectiveMode,
    setRadius: value => {
      radius.value = value;
    },
    setSize: value => {
      size.value = value;
    },
    setSpacing: value => {
      spacing.value = value;
    },
    setMode: value => {
      mode.value = value;
    },
    customPresets,
    appliedPresetName,
    extra,
    savePreset,
    removePreset,
    applyPreset: name => {
      appliedPresetName.value = name;
    },
    resetPreset: () => {
      appliedPresetName.value = null;
    },
    theme,
    setThemeState: config => {
      Object.assign(themeState, config);
    },
    refreshThemeConfig
  };
}
