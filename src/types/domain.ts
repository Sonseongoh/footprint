/**
 * Footprint domain model. Mirrors the Supabase schema
 * (supabase/migrations) and the bundled reference data
 * (src/data). See DESIGN.md.
 */

/** v1 supported countries. */
export type CountryCode = 'KR' | 'JP' | 'TH';

export const COUNTRIES: Record<CountryCode, { name: string; nameLocal: string }> = {
  KR: { name: 'South Korea', nameLocal: '한국' },
  JP: { name: 'Japan', nameLocal: '일본' },
  TH: { name: 'Thailand', nameLocal: '태국' },
};

/** [longitude, latitude] — GeoJSON order. */
export type Lng = number;
export type Lat = number;
export type Position = [Lng, Lat];

/**
 * Admin-1 region (시·도 / 都道府県 / จังหวัด). The fill + verification unit.
 * `id` is stable: `${country}-${adminCode}` (e.g. "JP-13" for Tokyo).
 */
export interface Region {
  id: string;
  country: CountryCode;
  name: string;
  nameLocal: string;
}

/** A check-in point used for offline city naming (nearest-point). */
export interface CityPoint {
  id: string;
  regionId: string;
  country: CountryCode;
  name: string;
  nameLocal: string;
  position: Position;
}

/** Source of a recorded visit event. 'recovered' is reserved for v1.1 (EXIF). */
export type VisitSource = 'live' | 'recovered';

/** One aggregate per (user, region). Re-visits accumulate into visitCount. */
export interface Visit {
  id: string;
  userId: string;
  regionId: string;
  country: CountryCode;
  firstVisitedAt: string;
  lastVisitedAt: string;
  visitCount: number;
}

/** A single check-in. note/photo carry the city-level depth within a region. */
export interface VisitEvent {
  id: string;
  userId: string;
  regionId: string;
  /** nearest city at check-in time, for depth/labeling */
  cityId: string | null;
  cityName: string | null;
  country: CountryCode;
  createdAt: string;
  source: VisitSource;
  lat: Lat;
  lng: Lng;
  accuracyM: number | null;
  note: string | null;
  photoPath: string | null;
}

/** Public share page (country fill map). Only fill + counts are exposed. */
export interface SharePage {
  slug: string;
  userId: string;
  country: CountryCode;
  isPublic: boolean;
  createdAt: string;
}
