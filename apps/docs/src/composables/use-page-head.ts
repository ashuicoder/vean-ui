import { toValue } from 'vue';
import type { MaybeRefOrGetter } from 'vue';
import { useHead } from '@unhead/vue';
import type { ResolvableLink, ResolvableMeta } from '@unhead/vue';

export interface PageHeadInput {
  title?: string;
  description?: string;
  meta?: ResolvableMeta[];
  link?: ResolvableLink[];
}

/**
 * Applies a page-level `<title>` / `<meta name="description">` / extra tags.
 *
 * `defineApp` in `src/app.ts` only carries the global fallback title, and ubean's
 * generated `_pages` table has no `head` for these routes, so every static page
 * would otherwise ship the same `<title>` and no description — which is what
 * Lighthouse reports as `document-title` / `meta-description` failures.
 *
 * Values are read through a getter so a locale switch re-applies the translated
 * strings instead of freezing the locale active during setup.
 */
export function usePageHead(input: MaybeRefOrGetter<PageHeadInput>): void {
  useHead(() => {
    const { title, description, meta, link } = toValue(input);

    return {
      title: title ?? null,
      meta: [...(description ? [{ name: 'description', content: description }] : []), ...(meta ?? [])],
      link: link ?? []
    };
  });
}
