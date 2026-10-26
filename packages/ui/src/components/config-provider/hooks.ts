import { computed, onMounted, onUnmounted, watch } from 'vue';
import type { ComputedRef } from 'vue';
import { THEME_STORAGE_KEY, THEME_STYLE_ID, createThemeWriter } from '@vean/theme/storage';
import { buildThemeCss } from '../../theme/adapter';
import type { ConfigProviderProps } from './types';
import { createThemeContext, provideThemeContext } from './use-theme';
import type { ConfigProviderThemeContext } from './use-theme';

/**
 * Wire the ConfigProvider theme runtime.
 *
 * The provider owns exactly three side effects — the derived CSS, the single
 * `<style id="vean-theme">` node, and the theme envelope — so each one gets its
 * own hook below and this function only states the order they start in. Keeping
 * the context opaque here is the point: nothing in the DOM layer needs to reach
 * into the theme state, they only exchange the derived CSS.
 */
export function useConfigProviderTheme(
  props: ConfigProviderProps,
  onExtraThemeChange: (extra: Record<string, unknown>) => void
) {
  const themeContext = createThemeContext(props);

  provideThemeContext(themeContext);

  const themeCss = useThemeStyle(props, themeContext);

  useThemeEnvelope(props, themeContext, themeCss, onExtraThemeChange);

  // `commitThemeConfig` 是 `setThemeState` 的对外名字：写回持久化主题配置并同步内存状态，
  // 使下游主题派生无需重读存储。通过 `defineExpose` 暴露给应用层。
  return { commitThemeConfig: themeContext.setThemeState };
}

/**
 * Derive the runtime CSS and keep the one runtime style element in sync.
 *
 * **Style application**: the runtime owns exactly one `<style id="vean-theme">`
 * in `<head>`. The first-paint script may have created it (with the persisted
 * snapshot); the provider adopts that element, or creates it when absent, and
 * keeps its content in sync. Nothing is rendered into the component tree, so
 * there is no server/client style-content mismatch and no `!important` dance —
 * precedence comes from specificity (the static default layer ships
 * `:where(...)`-weakened, docs/design/theme.md §6.1 / §6.3).
 */
function useThemeStyle(props: ConfigProviderProps, themeContext: ConfigProviderThemeContext): ComputedRef<string> {
  const themeCss = computed(() => buildThemeCss(themeContext.theme.value));
  const styleHolder = createStyleElementHolder();

  const applyCss = (): void => {
    const element = styleHolder.acquire(props.nonce);

    if (element) {
      element.textContent = themeCss.value;
    }
  };

  // 变更即时应用；首帧由挂载补一次（`watch` 不带 immediate 时不会自己跑）
  watch(themeCss, applyCss);
  onMounted(applyCss);

  return themeCss;
}

/**
 * Own the theme envelope: one key, one debounced writer, one cross-tab reader.
 *
 * **Persistence**: the derived payload (options + mode + style snapshot + custom
 * presets) goes into `__VEAN_THEME` through a single debounced writer; the theme
 * context itself writes nothing. preset 表与已应用 preset 同信封携带：写入方
 * 只有这里一处，不存在多写者竞争。
 *
 * **Lifecycle**: mount subscribes to cross-tab storage, unmount unsubscribes and
 * flushes the pending write. Both live in one hook, so the order — and the fact
 * that there is exactly one of each — is visible in a single place.
 */
function useThemeEnvelope(
  props: ConfigProviderProps,
  themeContext: ConfigProviderThemeContext,
  themeCss: ComputedRef<string>,
  onExtraThemeChange: (extra: Record<string, unknown>) => void
): void {
  const { theme, mode, customPresets, appliedPresetName, extra, refreshThemeConfig } = themeContext;

  const writer = createThemeWriter();

  watch(
    // `getExtraTheme` 必须作为**源**而不是在回调里调用：源才会被追踪，应用 store 的变化
    // 才能触发重写。放进回调体不会建立依赖，写入永远不会发生。
    [themeCss, mode, customPresets, appliedPresetName, () => props.getExtraTheme?.()],
    ([css, currentMode, presets, appliedPreset, extraPayload]) => {
      if (!props.persistTheme || typeof document === 'undefined') {
        return;
      }

      writer.write({
        options: theme.value,
        mode: currentMode,
        style: css,
        presets,
        ...(appliedPreset ? { appliedPreset } : {}),
        ...(extraPayload ? { extra: extraPayload } : {})
      });
    },
    { immediate: true }
  );

  // 跨标签页同步：storage 事件（其他标签页写入主题信封）触发整体重读 ——
  // options / mode / presets / applied preset / extra 一起刷新并重派生。
  const handleStorage = (event: StorageEvent): void => {
    if (event.key === THEME_STORAGE_KEY) {
      refreshThemeConfig();
      onExtraThemeChange(extra.value);
    }
  };

  onMounted(() => {
    if (!props.persistTheme) {
      return;
    }

    // 初始信封里的应用配置在挂载时下发一次（服务端不调）
    onExtraThemeChange(extra.value);
    window.addEventListener('storage', handleStorage);
  });

  onUnmounted(() => {
    // 未开启持久化时从未注册，移除是幂等的空操作
    window.removeEventListener('storage', handleStorage);
    writer.flush();
  });
}

/**
 * A lazily created holder for the runtime style element.
 *
 * The element is *not* rendered by the component (a head element cannot be
 * rendered from the app tree without a head manager), so the provider looks it
 * up — the first-paint script may already have created it — and creates it once
 * when missing. Later calls return the live element, so a theme change after
 * hydration writes to the same node the script built.
 */
function createStyleElementHolder(): { acquire: (nonce?: string) => HTMLStyleElement | null } {
  let element: HTMLStyleElement | null = null;

  const acquire = (nonce?: string): HTMLStyleElement | null => {
    if (typeof document === 'undefined') {
      return null;
    }

    element ??= adoptOrCreateStyleElement();

    // CSP 下由脚本创建的元素同样需要 nonce（'nonce-…' 来源的 style-src）
    if (nonce && !element.getAttribute('nonce')) {
      element.setAttribute('nonce', nonce);
    }

    return element;
  };

  return { acquire };
}

/** Reuse the element the first-paint script built, otherwise create and append one. */
function adoptOrCreateStyleElement(): HTMLStyleElement {
  const existing = document.getElementById(THEME_STYLE_ID);

  if (existing instanceof HTMLStyleElement) {
    return existing;
  }

  const element = document.createElement('style');

  element.id = THEME_STYLE_ID;
  document.head.appendChild(element);

  return element;
}
