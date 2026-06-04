/**
 * Location verification for Footprint check-ins.
 *
 * v1 model (confirmed in /plan-eng-review delta, 2026-06-02): a check-in is
 * valid when the device GPS point falls inside an admin-1 region polygon
 * (point-in-polygon). The matched region is the fill/collection unit. The
 * nearest bundled city point gives the city-level depth/name, and works
 * offline (expo-location reverseGeocode needs network on iOS).
 *
 *   device GPS ──▶ findRegion(pos, regions)  ── no match ──▶ "지원 구역 아님"
 *        │              │ match
 *        │              ▼
 *        └────────▶ nearestCity(pos, cities) ──▶ region + city + note + photo
 *
 * Polygons come from bundled, simplified GeoJSON (src/data). Keep this module
 * pure (no I/O) so it is fully unit-testable.
 */
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import type { Feature, MultiPolygon, Polygon } from 'geojson';

import type { CityPoint, CountryCode, Position, Region } from '@/types/domain';

/** A region polygon feature. `properties.id` matches Region.id. */
export type RegionFeature = Feature<Polygon | MultiPolygon, { id: string; country: CountryCode }>;

/** Default GPS accuracy gate (meters). Worse than this → ask the user to retry. */
export const MAX_ACCURACY_M = 500;

export type VerifyReason = 'ok' | 'no-region' | 'low-accuracy' | 'no-fix';

export interface VerifyResult {
  ok: boolean;
  reason: VerifyReason;
  regionId: string | null;
  city: CityPoint | null;
}

/** Great-circle distance in km between two [lng, lat] positions. */
export function haversineKm(a: Position, b: Position): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Returns the id of the first region polygon containing `pos`, or null. */
export function findRegion(pos: Position, regions: RegionFeature[]): string | null {
  for (const feature of regions) {
    if (booleanPointInPolygon(pos, feature)) {
      return feature.properties.id;
    }
  }
  return null;
}

/** Nearest bundled city point to `pos` (optionally constrained to a region). */
export function nearestCity(
  pos: Position,
  cities: CityPoint[],
  regionId?: string,
): CityPoint | null {
  let best: CityPoint | null = null;
  let bestKm = Infinity;
  for (const city of cities) {
    if (regionId && city.regionId !== regionId) continue;
    const km = haversineKm(pos, city.position);
    if (km < bestKm) {
      bestKm = km;
      best = city;
    }
  }
  return best;
}

export interface VerifyInput {
  /** [lng, lat] from expo-location */
  pos: Position | null;
  /** coords.accuracy in meters, or null if unknown */
  accuracyM: number | null;
  regions: RegionFeature[];
  cities: CityPoint[];
  maxAccuracyM?: number;
}

/**
 * Decide whether a check-in at `pos` is valid and resolve its region + city.
 * Never throws — callers branch on `reason` to drive the check-in UX.
 */
export function verifyCheckin({
  pos,
  accuracyM,
  regions,
  cities,
  maxAccuracyM = MAX_ACCURACY_M,
}: VerifyInput): VerifyResult {
  if (!pos) return { ok: false, reason: 'no-fix', regionId: null, city: null };
  if (accuracyM != null && accuracyM > maxAccuracyM) {
    return { ok: false, reason: 'low-accuracy', regionId: null, city: null };
  }
  const regionId = findRegion(pos, regions);
  if (!regionId) return { ok: false, reason: 'no-region', regionId: null, city: null };
  const city = nearestCity(pos, cities, regionId) ?? nearestCity(pos, cities);
  return { ok: true, reason: 'ok', regionId, city };
}
