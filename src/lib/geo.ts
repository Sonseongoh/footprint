/**
 * Location verification for Footprint check-ins.
 *
 * Unified model (2026-07-14): every country collects by CITY-BOUNDARY polygons
 * (KR 시, JP 시구정촌, TH 암프). A check-in is valid when the device GPS point
 * falls inside a city polygon (point-in-polygon) — the matched polygon IS the
 * collected city; there is no separate "nearest city point" concept. Standing
 * outside every city polygon (rural 군 / countryside) is a clean rejection,
 * never a snap to somewhere the user didn't stand ("가지 않은 곳은 기록될 수
 * 없다").
 *
 *   device GPS ──▶ findRegion(pos, cityAreas) ── no match ──▶ "지원 지역 아님"
 *                        │ match
 *                        ▼
 *                  city area id (= fill unit = board key) + note + photo
 *
 * Polygons come from bundled, simplified GeoJSON (src/data). Keep this module
 * pure (no I/O) so it is fully unit-testable.
 */
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import type { Feature, MultiPolygon, Polygon } from 'geojson';

import type { CountryCode, Position } from '@/types/domain';

/** A region polygon feature. `properties.id` matches Region.id. */
export type RegionFeature = Feature<
  Polygon | MultiPolygon,
  { id: string; country: CountryCode; name: string; nameLocal: string }
>;

/** Default GPS accuracy gate (meters). Worse than this → ask the user to retry. */
export const MAX_ACCURACY_M = 500;

export type VerifyReason = 'ok' | 'no-region' | 'low-accuracy' | 'no-fix';

export interface VerifyResult {
  ok: boolean;
  reason: VerifyReason;
  regionId: string | null;
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

export interface VerifyInput {
  /** [lng, lat] from expo-location */
  pos: Position | null;
  /** coords.accuracy in meters, or null if unknown */
  accuracyM: number | null;
  regions: RegionFeature[];
  maxAccuracyM?: number;
}

/**
 * Decide whether a check-in at `pos` is valid and resolve its collection unit.
 * Never throws — callers branch on `reason` to drive the check-in UX.
 */
export function verifyCheckin({
  pos,
  accuracyM,
  regions,
  maxAccuracyM = MAX_ACCURACY_M,
}: VerifyInput): VerifyResult {
  if (!pos) return { ok: false, reason: 'no-fix', regionId: null };
  if (accuracyM != null && accuracyM > maxAccuracyM) {
    return { ok: false, reason: 'low-accuracy', regionId: null };
  }
  const regionId = findRegion(pos, regions);
  if (!regionId) return { ok: false, reason: 'no-region', regionId: null };
  return { ok: true, reason: 'ok', regionId };
}
