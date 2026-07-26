// lib/theme.ts
// Scroll design tokens. A single always-dark, cinema-style palette: true
// black canvas, one saturated red accent, and a tight greyscale ramp so
// artwork is the only real colour on screen.

export const colors = {
  /** Page canvas — true black so posters bleed into the background. */
  background: '#000000',
  /** Cards, chips, inputs. */
  surface: '#141414',
  surfaceElevated: '#1F1F1F',
  surfaceHover: '#2A2A2A',

  /** The one accent: play buttons, active tabs, progress fills. */
  accent: '#E50914',
  accentDim: '#B20710',

  text: '#FFFFFF',
  textSecondary: '#D2D2D2',
  textMuted: '#8C8C8C',
  textFaint: '#5A5A5A',

  border: 'rgba(255,255,255,0.10)',
  borderStrong: 'rgba(255,255,255,0.22)',

  /** Scrim over artwork so text stays legible. */
  scrim: 'rgba(0,0,0,0.6)',
  overlay: 'rgba(0,0,0,0.82)',

  success: '#46D369',
  white: '#FFFFFF',
  black: '#000000',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 18,
  pill: 999,
} as const;

export const typography = {
  hero: 30,
  title: 22,
  section: 17,
  body: 14,
  label: 13,
  caption: 11,
} as const;

export const weights = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  black: '800',
} as const;

/** Poster geometry. Short-drama artwork is a 2:3 portrait. */
export const POSTER = {
  width: 112,
  height: 168,
  ratio: 2 / 3,
} as const;

export const POSTER_LARGE = {
  width: 140,
  height: 210,
} as const;

/**
 * Gradient stops for the scrim under the billboard hero. Typed as a tuple
 * because LinearGradient requires at least two stops.
 */
export const HERO_GRADIENT: readonly [string, string, ...string[]] = [
  'transparent',
  'rgba(0,0,0,0.35)',
  'rgba(0,0,0,0.85)',
  '#000000',
];

export const CARD_GRADIENT: readonly [string, string] = ['transparent', 'rgba(0,0,0,0.85)'];
