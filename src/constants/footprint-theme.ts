/**
 * Footprint visual tokens — confirmed in /plan-design-review (2026-06-02).
 * Dark night-navy collection aesthetic with a single warm gold accent
 * (treasure/collection metaphor). Used by the globe, country map, and
 * check-in screens. See DESIGN.md "## Visual Design".
 */

export const Palette = {
  /** deep night-navy app background */
  bg: '#0B1026',
  bgElevated: '#131A38',
  surface: '#222B4D',
  surfaceLine: '#46517D',
  /** visited / filled — warm gold, the collection accent */
  gold: '#F5C26B',
  goldDeep: '#E8A84A',
  /** unvisited region fill */
  slate: '#222B4D',
  slateOutline: '#46517D',
  /** ocean gradient stops for the globe */
  ocean1: '#235E69',
  ocean2: '#10213F',
  ink: '#EAEEFB',
  muted: '#8893B8',
} as const;

/** 4px base spacing scale */
export const Space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

/**
 * Display = Space Grotesk (numbers/titles, game-y), body = Pretendard
 * (Korean + Latin). These font families must be loaded via expo-font before
 * use; until then the platform falls back to system fonts.
 */
export const Type = {
  display: 'SpaceGrotesk',
  body: 'Pretendard',
} as const;

/** Minimum accessible sizes (design review a11y pass) */
export const A11y = {
  minTouch: 44,
  minBodySize: 16,
} as const;
