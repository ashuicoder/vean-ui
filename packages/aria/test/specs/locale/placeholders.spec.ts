import { describe, expect, it } from 'vitest';
import { getPlaceholder } from '../../../src/date/placeholders';
import { registerLocale } from '../../../src/locale';
import ar from '../../../src/locale/langs/ar';
import de from '../../../src/locale/langs/de';
import en from '../../../src/locale/langs/en';
import es from '../../../src/locale/langs/es';
import fr from '../../../src/locale/langs/fr';
import id from '../../../src/locale/langs/id';
import ptBR from '../../../src/locale/langs/pt-BR';
import ru from '../../../src/locale/langs/ru';
import tr from '../../../src/locale/langs/tr';
import type { LocaleRegistry } from '../../../src/locale/types';

const localized = [
  ['de', de],
  ['fr', fr],
  ['es', es],
  ['ru', ru],
  ['ar', ar],
  ['id', id],
  ['tr', tr],
  ['pt-BR', ptBR]
] as const satisfies readonly (readonly [string, LocaleRegistry])[];

describe('date placeholders', () => {
  it('translates every field for the shipped latin/cyrillic/arabic locales', () => {
    // Copying en's `yyyy`/`mm`/`dd` into a locale is the failure mode this
    // guards: the field renders readable English tokens to a reader who does
    // not read English.
    for (const [key, locale] of localized) {
      const { year, month, day } = locale.messages.date.placeholder;

      expect(year, `${key}.placeholder.year`).not.toBe(en.messages.date.placeholder.year);
      expect(month, `${key}.placeholder.month`).not.toBe(en.messages.date.placeholder.month);
      expect(day, `${key}.placeholder.day`).not.toBe(en.messages.date.placeholder.day);
    }
  });

  it('keeps the placeholder tokens distinct within a locale', () => {
    for (const [key, locale] of localized) {
      const { year, month, day } = locale.messages.date.placeholder;
      const set = new Set([year.toLowerCase(), month.toLowerCase(), day.toLowerCase()]);

      expect(set.size, `${key} placeholder tokens collide`).toBe(3);
    }
  });

  it('serves the localized placeholder through getPlaceholder', () => {
    // `de` ships as a file but is not in the default registry; registering it
    // is what the app does at setup, so the lookup path is exercised end to end.
    registerLocale(de);

    expect(getPlaceholder('year', '', 'de')).toBe('JJJJ');
    expect(getPlaceholder('month', '', 'de')).toBe('MM');
    expect(getPlaceholder('day', '', 'de')).toBe('TT');
    expect(getPlaceholder('year', '', 'de-AT')).toBe('JJJJ');
    expect(getPlaceholder('year', '', 'en')).toBe('yyyy');
  });

  it('falls back to en for a locale without its own entry', () => {
    expect(getPlaceholder('year', '', 'unknown-xx')).toBe('yyyy');
  });

  it('returns the raw value for era and dayPeriod segments', () => {
    expect(getPlaceholder('dayPeriod', 'AM', 'de')).toBe('AM');
    expect(getPlaceholder('era', 'AD', 'de')).toBe('AD');
  });

  it('returns a non-numeric marker for time segments', () => {
    expect(getPlaceholder('hour', '', 'de')).toBe('––');
    expect(getPlaceholder('minute', '', 'de')).toBe('––');
    expect(getPlaceholder('second', '', 'de')).toBe('––');
  });
});

describe('date segment labels', () => {
  it('names the day period the way Intl names it for the locale', () => {
    // The value is only the screen reader label (24-hour locales never render a
    // day-period segment), but it should still match what `Intl` produces when
    // a 12-hour value is forced — otherwise a Spanish reader hears "AM/PM".
    expect(es.messages.date.dayPeriodSegment).toBe('a. m./p. m.,');
    expect(tr.messages.date.dayPeriodSegment).toBe('ÖÖ/ÖS,');
    expect(ar.messages.date.dayPeriodSegment).toBe('ص/م، ');

    // `de` / `fr` / `ru` / `pt-BR` / `id` are 24-hour locales and `Intl` itself
    // falls back to the latin `AM`/`PM` tokens for them, so theirs stays put.
    expect(de.messages.date.dayPeriodSegment).toBe('AM/PM,');
    expect(en.messages.date.dayPeriodSegment).toBe('AM/PM, ');
  });
});
