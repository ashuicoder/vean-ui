import { computed, onServerPrefetch, shallowRef, watchEffect } from 'vue';
import { useI18n } from 'vue-i18n';
import { readGeneratedMessagePath, resolveGeneratedLocaleFileName } from '~/shared/generated-messages';
import type { GeneratedMessages } from '~/shared/generated-messages';

// Generated API / changelog descriptions live in `src/generated/{api,changelog}-locales/*.json`,
// keyed by dotted `descriptionKey` / `summaryKey` paths. Two rules keep them off the critical path:
//
// 1. Only non-default locales are ever fetched. The generator writes the default locale (`en`) by
//    copying the source string verbatim — verified against all 9758 API keys and 1135 changelog
//    keys — so `resolveGeneratedText` already falls back to identical source text. Bundling `en`
//    cost ~93 KB gzip for no visible difference.
// 2. The `zh-CN` pair is loaded on demand for the active locale instead of being inlined into the
//    entry graph. English readers never download it; zh pages fetch it during SSR
//    (`onServerPrefetch`) and the client reuses the same promise.
//
// Both directories use the same file name (`zh-CN.json`), so a locale maps to a *list* of message
// trees — one per generated source — that are merged before lookup.
const generatedLocaleModules = import.meta.glob<GeneratedMessages>(
  ['../generated/api-locales/zh-CN.json', '../generated/changelog-locales/zh-CN.json'],
  { import: 'default' }
);

const generatedMessagesByFile = shallowRef<Record<string, GeneratedMessages>>({});
const pendingLoads = new Map<string, Promise<void>>();

/** Fetch every generated locale file for `locale`, reusing an in-flight request when present. */
function loadGeneratedMessages(locale: string): Promise<void> {
  const fileName = resolveGeneratedLocaleFileName(locale);

  // Default locale: the source text inside the generated documents is already this locale.
  if (fileName === 'en' || generatedMessagesByFile.value[fileName]) {
    return Promise.resolve();
  }

  const inFlight = pendingLoads.get(fileName);

  if (inFlight) {
    return inFlight;
  }

  const loaders = Object.entries(generatedLocaleModules)
    .filter(([path]) => path.endsWith(`/${fileName}.json`))
    .map(([, load]) => load);

  if (loaders.length === 0) {
    return Promise.resolve();
  }

  const pending = Promise.all(loaders.map(load => load().catch(() => null)))
    .then(modules => {
      const messages = Object.assign({}, ...modules.filter(Boolean));

      generatedMessagesByFile.value = { ...generatedMessagesByFile.value, [fileName]: messages };
    })
    .finally(() => {
      pendingLoads.delete(fileName);
    });

  pendingLoads.set(fileName, pending);

  return pending;
}

export function useGeneratedI18n() {
  const { locale } = useI18n({ useScope: 'global' });
  const generatedMessages = computed(
    () => generatedMessagesByFile.value[resolveGeneratedLocaleFileName(locale.value)] ?? {}
  );

  function resolveGeneratedText(text?: string | null, textKey?: string | null) {
    if (textKey) {
      const translated = readGeneratedMessagePath(generatedMessages.value, textKey)?.trim();

      if (translated && translated !== textKey) {
        return translated;
      }
    }

    return text?.trim() ?? '';
  }

  // SSR must resolve the locale files before rendering, otherwise the prerendered HTML would carry
  // untranslated source text; the client effect mirrors it for client-side navigation.
  onServerPrefetch(() => loadGeneratedMessages(locale.value));

  watchEffect(() => {
    void loadGeneratedMessages(locale.value);
  });

  return {
    resolveGeneratedText
  };
}
