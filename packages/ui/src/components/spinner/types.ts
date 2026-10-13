import type { ClassValue } from '@vean/aria/types';
import type { ThemeColor, ThemeSize } from '@/theme';
import type { IconProps } from '../icon/types';

/**
 * Type information for SpinnerIcon.
 */
export type SpinnerIcon = `svg-spinners:${string}`;

/**
 * Properties for the Spinner component.
 */
export interface SpinnerProps extends Omit<IconProps, 'icon' | 'color'> {
  /**
   * Accessible name of the spinner.
   *
   * Inherited from `IconProps` but given a default here: `SIcon` hides itself from
   * assistive tech (`ariaHidden: true`) and that default is wrong for a spinner, which
   * is the only thing on screen while loading. `role="img"` without a name is an
   * `svg-img-alt` failure.
   *
   * @default 'Loading'
   */
  ariaLabel?: string;
  /**
   * Additional class names applied to the root element.
   */
  class?: ClassValue;
  /**
   * Theme color of the component.
   */
  color?: ThemeColor;
  /**
   * The spinner icon name from the Iconify svg-spinners collection.
   *
   * @default 'svg-spinners:270-ring'
   */
  icon?: SpinnerIcon;
  /**
   * Visual size of the component.
   */
  size?: ThemeSize;
}
