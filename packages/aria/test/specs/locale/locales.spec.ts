import { describe, expect, it } from 'vitest';
// `resolveLocaleDirection` is consumed by ConfigProvider but not part of the
// public `/locale` entry, so the test reaches into the module directly.
import { resolveLocaleDirection } from '../../../src/locale/locales';
import { registerLocale, resolveLocale, resolveLocaleRegistry } from '../../../src/locale';
import ar from '../../../src/locale/langs/ar';
import fr from '../../../src/locale/langs/fr';
import ptBR from '../../../src/locale/langs/pt-BR';
import zhTW from '../../../src/locale/langs/zh-TW';

describe('locale resolution — default registry', () => {
  it('resolves registered keys exactly', () => {
    expect(resolveLocaleRegistry('en').key).toBe('en');
    expect(resolveLocaleRegistry('zh-CN').key).toBe('zh-CN');
  });

  it('resolves a bare language tag to its registered regional variant', () => {
    expect(resolveLocaleRegistry('zh').key).toBe('zh-CN');
  });

  it('falls back to en for nothing and unknown tags', () => {
    expect(resolveLocaleRegistry().key).toBe('en');
    expect(resolveLocaleRegistry('unknown-xx').key).toBe('en');
  });

  it('matches case-insensitively (RFC 4647)', () => {
    expect(resolveLocaleRegistry('ZH-CN').key).toBe('zh-CN');
    expect(resolveLocaleRegistry('zh-cn').key).toBe('zh-CN');
    expect(resolveLocaleRegistry('EN').key).toBe('en');
  });

  it('resolves the extended subtag chain to the registered base', () => {
    expect(resolveLocaleRegistry('zh-Hans').key).toBe('zh-CN');
    expect(resolveLocaleRegistry('zh-Hans-CN').key).toBe('zh-CN');
  });

  it('returns messages, not just the registry entry', () => {
    expect(resolveLocale('zh').pagination.nextPage).toBe('下一页');
    expect(resolveLocale('zh-Hans-CN').pagination.nextPage).toBe('下一页');
    expect(resolveLocale('en').pagination.nextPage).toBe('Next page');
  });

  it('refuses a script conflict instead of serving the wrong characters', () => {
    // Only `zh-CN` (Hans) is registered here. A `Hant` request must not fall
    // through to simplified Chinese — `en` is the safer default.
    expect(resolveLocaleRegistry('zh-Hant').key).toBe('en');
    expect(resolveLocaleRegistry('zh-Hant-TW').key).toBe('en');
  });
});

describe('locale resolution — parent chain', () => {
  it('resolves a regional tag to its registered base language', () => {
    registerLocale(fr);

    expect(resolveLocaleRegistry('fr').key).toBe('fr');
    expect(resolveLocaleRegistry('fr-FR').key).toBe('fr');
    expect(resolveLocaleRegistry('fr-CA').key).toBe('fr');
    expect(resolveLocale('fr-CA').pagination.nextPage).toBe('Page suivante');
  });

  it('resolves likely-subtags for a bare tag', () => {
    registerLocale(ptBR);

    expect(resolveLocaleRegistry('pt').key).toBe('pt-BR');
    expect(resolveLocaleRegistry('pt-PT').key).toBe('pt-BR');
  });
});

describe('locale resolution — same primary language', () => {
  it('prefers the matching script over registration order', () => {
    registerLocale(zhTW);

    // zh-HK is Hant (traditional); simplified zh-CN would show wrong characters.
    expect(resolveLocaleRegistry('zh-HK').key).toBe('zh-TW');
    expect(resolveLocaleRegistry('zh-MO').key).toBe('zh-TW');
    expect(resolveLocaleRegistry('zh-SG').key).toBe('zh-CN');
  });

  it('resolves a bare Hant request once zh-TW is registered', () => {
    // Same input that fell back to `en` in the previous block now has a home.
    expect(resolveLocaleRegistry('zh-Hant').key).toBe('zh-TW');
  });

  it('keeps bare zh on the simplified variant after zh-TW joins', () => {
    expect(resolveLocaleRegistry('zh').key).toBe('zh-CN');
  });
});

describe('resolveLocaleDirection', () => {
  it('trusts a registered dir', () => {
    expect(resolveLocaleDirection('en')).toBe('ltr');
    expect(resolveLocaleDirection('zh-CN')).toBe('ltr');
  });

  it('derives rtl from the primary subtag of unregistered locales', () => {
    expect(resolveLocaleDirection('ar')).toBe('rtl');
    expect(resolveLocaleDirection('ar-EG')).toBe('rtl');
    expect(resolveLocaleDirection('he-IL')).toBe('rtl');
  });

  it('reports ltr for registered rtl-language locales and empty input', () => {
    // `ar` is RTL by subtag; the registered entry decides once it exists.
    expect(resolveLocaleDirection('ar-EG')).toBe('rtl');
    expect(resolveLocaleDirection()).toBe('ltr');
    expect(resolveLocaleDirection('unknown-xx')).toBe('ltr');
  });

  it('honours an explicitly registered dir', () => {
    registerLocale({ ...ar, key: 'ar', dir: 'ltr' });

    expect(resolveLocaleDirection('ar')).toBe('ltr');
    expect(resolveLocaleDirection('ar-EG')).toBe('ltr');
  });
});

describe('registerLocale', () => {
  it('accepts a bare key plus messages', () => {
    registerLocale('de-test', resolveLocale('en'));

    const entry = resolveLocaleRegistry('de-test');
    expect(entry.key).toBe('de-test');
    expect(entry.name).toBe('de-test');
    expect(entry.messages.pagination.nextPage).toBe('Next page');
    // Region variants resolve back through the parent chain.
    expect(resolveLocaleRegistry('de-test-AT').key).toBe('de-test');
  });

  it('makes later registrations findable immediately', () => {
    const before = resolveLocaleRegistry('xx-late').key;
    registerLocale('xx-late', resolveLocale('en'));

    expect(before).toBe('en');
    expect(resolveLocaleRegistry('xx-late').key).toBe('xx-late');
  });
});
