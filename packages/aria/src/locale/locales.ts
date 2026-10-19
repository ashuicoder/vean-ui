import type { Direction } from '../types';
import enLocale from './langs/en';
import zhCNLocale from './langs/zh-CN';
import type { LocaleMessages, LocaleRegistry } from './types';

/**
 * Registered locales, keyed by their original (as-registered) `key`.
 */
const localeRegistry: Record<string, LocaleRegistry> = {
  [enLocale.key]: enLocale,
  [zhCNLocale.key]: zhCNLocale
};

/**
 * Canonical lookup index (`zh-CN` / `ZH-cn` / `zh-cn` all collapse to one key).
 * Rebuilt lazily after every registration.
 */
let canonicalIndex: Map<string, LocaleRegistry> | null = null;

/**
 * Canonicalize a BCP-47 tag for case-insensitive comparison.
 *
 * `zh` → `zh`, `ZH-cn` → `zh-CN`, `zh-hans-cn` → `zh-Hans-CN`.
 * BCP-47 says matching is case-insensitive (RFC 4647 §2.1) but the registry
 * object is not, so every comparison goes through this.
 */
function canonicalizeTag(tag: string): string {
  return tag
    .split('-')
    .map((subtag, index) => {
      if (index === 0) return subtag.toLowerCase();
      // 4-letter subtag is a script (`Hans`); 2-letter is a region (`CN`).
      if (subtag.length === 4) return subtag.charAt(0).toUpperCase() + subtag.slice(1).toLowerCase();
      if (subtag.length === 2) return subtag.toUpperCase();
      return subtag.toLowerCase();
    })
    .join('-');
}

/**
 * Progressively less specific forms, most specific first.
 * `zh-Hans-CN` → `['zh-Hans-CN', 'zh-Hans', 'zh']`.
 */
function parentChain(canonicalTag: string): string[] {
  const subtags = canonicalTag.split('-');
  return subtags.map((_, index) => subtags.slice(0, subtags.length - index).join('-'));
}

/**
 * CLDR likely-subtags expansion: `zh` → `zh-Hans-CN`, `pt` → `pt-Latn-BR`.
 * Returns `undefined` when the runtime rejects the tag.
 */
function maximize(canonicalTag: string): Intl.Locale | undefined {
  try {
    return new Intl.Locale(canonicalTag).maximize();
  } catch {
    return undefined;
  }
}

function getCanonicalIndex(): Map<string, LocaleRegistry> {
  if (!canonicalIndex) {
    canonicalIndex = new Map(
      Object.values(localeRegistry).map(locale => [canonicalizeTag(locale.key), locale] as const)
    );
  }
  return canonicalIndex;
}

/**
 * Match on the same primary language when no exact/parent match exists.
 *
 * With `zh-CN` and `zh-TW` both registered, `zh-HK` (a `Hant` locale) must pick
 * `zh-TW` — simplified Chinese would show the wrong characters. Script wins
 * over registration order.
 *
 * A script conflict is a hard stop: when the target asks for `Hant` and only
 * `zh-CN` (`Hans`) is registered, returning it would render traditional users
 * simplified characters. Falling back to `en` is the correct answer — the
 * caller's next step is the framework default, not the wrong script.
 */
function findByPrimaryLanguage(canonicalTag: string): LocaleRegistry | undefined {
  const [primary] = canonicalTag.split('-');
  const candidates = Array.from(getCanonicalIndex().entries()).filter(([tag]) => tag.split('-')[0] === primary);
  if (candidates.length === 0) {
    return undefined;
  }
  if (candidates.length === 1) {
    const targetScript = maximize(canonicalTag)?.script;
    const candidateScript = maximize(candidates[0]![0])?.script;
    if (targetScript && candidateScript && targetScript !== candidateScript) {
      return undefined;
    }
    return candidates[0]![1];
  }

  const targetScript = maximize(canonicalTag)?.script;
  if (!targetScript) {
    return candidates[0]![1];
  }

  return candidates.find(([tag]) => maximize(tag)?.script === targetScript)?.[1];
}

/**
 * Locate the registry entry for `locale`, or `undefined` when nothing matches.
 *
 * Resolution order (first match wins):
 * 1. exact key
 * 2. canonical form (`ZH-cn` → `zh-CN`)
 * 3. parent chain (`zh-Hans-CN` → `zh-Hans` → `zh`)
 * 4. likely-subtags expansion (`pt` → registered `pt-BR`)
 * 5. same primary language, script-preferred (`zh-HK` → registered `zh-TW`)
 *
 * Steps 1–2 are covered by the canonical index; step 3 walks the chain.
 */
function findRegisteredLocale(locale: string): LocaleRegistry | undefined {
  const canonicalTag = canonicalizeTag(locale);
  const index = getCanonicalIndex();

  for (const candidate of parentChain(canonicalTag)) {
    const hit = index.get(candidate);
    if (hit) {
      return hit;
    }
  }

  // Likely-subtags: compare fully expanded forms so `pt` finds `pt-BR` but
  // `zh-TW` does not swallow `zh-CN`.
  const target = maximize(canonicalTag);
  if (target) {
    const expanded = Array.from(index.entries()).find(([tag]) => maximize(tag)?.toString() === target.toString());
    if (expanded) {
      return expanded[1];
    }
  }

  return findByPrimaryLanguage(canonicalTag);
}

/**
 * Register a locale so `useLocaleMessages()` can resolve it by name.
 *
 * Call this once at app setup before mounting.
 *
 * Supported forms:
 * 1. `registerLocale(localeRegistry)` for built-in locale files or any custom locale
 *    that needs explicit `name` and `dir` metadata.
 * 2. `registerLocale(key, messages)` for a lightweight custom locale keyed only by
 *    its message table.
 *
 * For example:
 * ```ts
 * import { registerLocale } from '@vean/aria/locale';
 * import type { LocaleMessages } from '@vean/aria/locale';
 * import zhTW from '@vean/aria/locale/zh-TW';
 *
 * registerLocale(zhTW);
 *
 * // or register a custom locale by key:
 *
 * const customMessages: LocaleMessages = {
 *  // ...messages
 * }
 * registerLocale('fr', customMessages);
 * ```
 */
export function registerLocale(locale: LocaleRegistry): void;
export function registerLocale(key: string, messages: LocaleMessages): void;
export function registerLocale(localeOrKey: LocaleRegistry | string, messagesOrLocale?: LocaleMessages): void {
  const locale =
    typeof localeOrKey === 'string'
      ? {
          key: localeOrKey,
          name: localeOrKey,
          messages: messagesOrLocale as LocaleMessages
        }
      : localeOrKey;

  localeRegistry[locale.key] = locale;
  canonicalIndex = null;
}

/**
 * Resolve a locale to its registry entry, falling back to `en`.
 *
 * BCP-47 matching is case-insensitive and falls back through the parent chain,
 * so `zh` resolves to a registered `zh-CN` and `fr-FR` to a registered `fr`.
 */
export function resolveLocaleRegistry(locale?: string): LocaleRegistry {
  if (!locale) {
    return enLocale;
  }
  return findRegisteredLocale(locale) ?? enLocale;
}

/**
 * Look up registered messages for `locale`, falling back to `en`.
 * Only `en` and `zh-CN` are pre-registered by default.
 */
export function resolveLocale(locale: string): LocaleMessages {
  return resolveLocaleRegistry(locale).messages;
}

/**
 * BCP-47 language subtags whose writing direction is right-to-left.
 * Used as a fallback when a locale is not explicitly registered but its primary
 * subtag is a known RTL language (e.g. `ar`, `ar-EG`, `he-IL`, `fa-IR`).
 */
const RTL_LOCALE_PREFIXES = new Set(['ar', 'he', 'fa', 'ur', 'yi', 'ps', 'sd', 'ug', 'ku', 'dv']);

export function resolveLocaleDirection(locale?: string): Direction {
  if (!locale) {
    return 'ltr';
  }

  // Only trust a registry hit: the `en` fallback would otherwise report `ltr`
  // for every unregistered RTL locale (`ar-EG`).
  const registered = findRegisteredLocale(locale)?.dir;
  if (registered) {
    return registered;
  }

  const prefix = locale.split('-')[0]?.toLowerCase();
  return prefix && RTL_LOCALE_PREFIXES.has(prefix) ? 'rtl' : 'ltr';
}

export { enLocale as en };
