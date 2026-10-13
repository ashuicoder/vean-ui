import type { FeedbackSchemeKey, PaletteKey, PaletteLevel, PaletteLevelRef, StatusName } from './types';

/**
 * Scheme data (docs/design/theme.md §3.6).
 *
 * A scheme is plain data: `palette.level` references for the light and dark
 * mode. Keeping schemes as data (not code) is what lets the status dimension
 * stay swappable without touching the engine.
 *
 * Charts are deliberately **not** a scheme: a chart series is a monochrome ramp
 * of the primary palette at fixed levels (`CHART_RAMP`, §4.7), so a chart
 * palette would be a second brand knob that could disagree with the first.
 */

/**
 * a status scheme: the solid color of each status, per mode.
 *
 * Values are `palette.level` references (not bare strings), so a typo in a scheme
 * is a type error and `engine-features.spec.ts` can assert every value resolves
 * against colord's palette table.
 *
 * Light picks the lowest of `.700` / `.800` that keeps the text role readable, dark stays
 * at `.300` / `.400`. The level is not free to pick: a status token is used as **both**
 * the solid fill and the text color of the softer treatment (`bg-destructive/10
 * text-destructive`), and `.500` fails the second role outright — `red.500` on white is
 * 3.76:1, `green.500` 2.28:1, `amber.500` 2.15:1, `blue.500` 3.68:1, all under the
 * 4.5:1 AA floor, and each one is worse on its own 10% tint (`green.500`: 2.03:1).
 *
 * `.700` is the base, but the yellow-green hues do not clear the third check at `.700`
 * (text on its own tint: `green.700` 4.38:1, `amber.700` 4.39:1, `orange.700` 4.48:1),
 * so those step to `.800` — same level for a different hue, not a different role. The
 * floor every entry meets is text-on-white ≥ 5.0:1, fill-on-`{b}.50` ≥ 4.8:1 and
 * text-on-own-tint ≥ 4.5:1.
 */
export interface FeedbackScheme {
  light: Record<StatusName, PaletteLevelRef>;
  dark: Record<StatusName, PaletteLevelRef>;
}

/** the built-in status schemes. */
export const FEEDBACK_SCHEMES = {
  classic: {
    light: { destructive: 'red.700', success: 'green.800', warning: 'amber.800', info: 'blue.700' },
    dark: { destructive: 'red.400', success: 'green.400', warning: 'amber.400', info: 'blue.400' }
  },
  vivid: {
    light: {
      destructive: 'red.700',
      success: 'emerald.700',
      warning: 'amber.800',
      info: 'sky.700'
    },
    dark: { destructive: 'red.400', success: 'emerald.400', warning: 'amber.400', info: 'sky.400' }
  },
  subtle: {
    light: {
      destructive: 'rose.700',
      success: 'emerald.700',
      warning: 'amber.800',
      info: 'indigo.700'
    },
    dark: {
      destructive: 'rose.300',
      success: 'emerald.300',
      warning: 'amber.300',
      info: 'indigo.300'
    }
  },
  modern: {
    light: {
      destructive: 'red.700',
      success: 'emerald.700',
      warning: 'orange.800',
      info: 'sky.700'
    },
    dark: {
      destructive: 'red.400',
      success: 'emerald.400',
      warning: 'orange.400',
      info: 'sky.400'
    }
  },
  professional: {
    light: { destructive: 'red.700', success: 'green.800', warning: 'amber.800', info: 'blue.700' },
    dark: { destructive: 'red.300', success: 'green.300', warning: 'amber.300', info: 'blue.300' }
  }
} as const satisfies Record<string, FeedbackScheme>;

/** resolve a feedback scheme, falling back to the default. */
export function feedbackScheme(key: FeedbackSchemeKey | undefined): FeedbackScheme {
  return (FEEDBACK_SCHEMES as Record<string, FeedbackScheme>)[key ?? 'classic'] ?? FEEDBACK_SCHEMES.classic;
}

/** split a `palette.level` reference. */
export function splitLevelRef(ref: string): { palette: PaletteKey; level: PaletteLevel } {
  const [palette, level] = ref.split('.');

  return { palette: palette as PaletteKey, level: Number(level) as PaletteLevel };
}
