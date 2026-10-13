import { createHighlighterCore } from 'shiki/core';
import type { DynamicImportLanguageRegistration, DynamicImportThemeRegistration, HighlighterCore } from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';
import { SHIKI_THEMES } from './shiki-config';
import type { SHIKI_LANGS } from './shiki-config';

type GrammarLang = Exclude<(typeof SHIKI_LANGS)[number], 'text'>;

/**
 * Fine-grained entry points. The bundled `shiki` entry pulled every grammar and
 * theme into the module graph, which made this module and the example gallery
 * chunk import each other; the shared export helper then landed in whichever
 * chunk lost the ordering race and was still undefined when the other ran.
 * One sub-path per grammar keeps the two chunks independent.
 */
const themeLoaders = {
  'one-light': () => import('@shikijs/themes/one-light'),
  'one-dark-pro': () => import('@shikijs/themes/one-dark-pro')
} satisfies Record<(typeof SHIKI_THEMES)[keyof typeof SHIKI_THEMES], DynamicImportThemeRegistration>;

const grammarLoaders = {
  vue: () => import('@shikijs/langs/vue'),
  ts: () => import('@shikijs/langs/ts'),
  tsx: () => import('@shikijs/langs/tsx'),
  js: () => import('@shikijs/langs/js'),
  jsx: () => import('@shikijs/langs/jsx'),
  bash: () => import('@shikijs/langs/bash'),
  json: () => import('@shikijs/langs/json'),
  jsonc: () => import('@shikijs/langs/jsonc'),
  html: () => import('@shikijs/langs/html'),
  css: () => import('@shikijs/langs/css'),
  scss: () => import('@shikijs/langs/scss'),
  yaml: () => import('@shikijs/langs/yaml'),
  markdown: () => import('@shikijs/langs/markdown')
} satisfies Record<GrammarLang, DynamicImportLanguageRegistration>;

let highlighterPromise: Promise<HighlighterCore> | undefined;

function getHighlighter(): Promise<HighlighterCore> {
  // Grammars are registered on demand by `highlightToHtml`: preloading all
  // thirteen of them added ~60 KB to every page, and most pages use one or two.
  //
  // The Oniguruma WASM engine is the right trade here. The JavaScript regex
  // engine avoided 183 KB of transfer, but tokenizes this content ~3x slower
  // (773 ms vs 247 ms for the button examples alone), which lands as blocking
  // main-thread time on exactly the pages that already ship the most markup.
  highlighterPromise ??= createHighlighterCore({
    themes: Object.values(themeLoaders).map(load => load()),
    langs: [],
    engine: createOnigurumaEngine(import('shiki/wasm'))
  });

  return highlighterPromise;
}

const grammarLoads = new Map<string, Promise<unknown>>();

async function loadGrammar(highlighter: HighlighterCore, lang: string): Promise<void> {
  if (highlighter.getLoadedLanguages().includes(lang)) {
    return;
  }

  const loader = grammarLoaders[lang as GrammarLang];

  if (!loader) {
    return;
  }

  let pending = grammarLoads.get(lang);

  if (!pending) {
    pending = loader().then(grammar => highlighter.loadLanguage(grammar));
    grammarLoads.set(lang, pending);
  }

  await pending;
}

export async function highlightToHtml(code: string, lang: string): Promise<string> {
  const highlighter = await getHighlighter();

  await loadGrammar(highlighter, lang);

  const isLoaded = highlighter.getLoadedLanguages().includes(lang);

  return highlighter.codeToHtml(code, {
    lang: isLoaded ? lang : 'text',
    themes: SHIKI_THEMES,
    defaultColor: false
  });
}
