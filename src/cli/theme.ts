import type { StatusColor } from '../core/types.js';

/** Theme selection (Spec 01 §4 ui.theme). */
export type ThemeName = 'dark' | 'light';

export interface Theme {
  name: ThemeName;
  /** Ink color name for each resource status. */
  status: Record<StatusColor, string>;
  /** Foreground for primary text. */
  foreground: string;
  /** Dim/secondary text. */
  dim: string;
  /** Accent for active/selected elements. */
  accent: string;
}

const DARK: Theme = {
  name: 'dark',
  status: { green: 'green', yellow: 'yellow', red: 'red', grey: 'gray' },
  foreground: 'white',
  dim: 'gray',
  accent: 'cyan',
};

const LIGHT: Theme = {
  name: 'light',
  status: { green: 'green', yellow: 'yellow', red: 'red', grey: 'blackBright' },
  foreground: 'black',
  dim: 'blackBright',
  accent: 'blue',
};

export function selectTheme(name: ThemeName): Theme {
  return name === 'light' ? LIGHT : DARK;
}
