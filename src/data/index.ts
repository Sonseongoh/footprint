/**
 * Bundled reference data loader. Two polygon layers per country, loaded via
 * require() so a country the user never opens is not parsed:
 *  - city areas (cityareas.*.json) — the collection unit / fill unit / board
 *    key (KR 시, JP 시구정촌, TH 암프)
 *  - admin-1 regions (regions.*.json) — backdrop + parent display name only
 */
import { verifyCheckin, type RegionFeature, type VerifyResult } from '@/lib/geo';
import type { CountryCode, Position } from '@/types/domain';

type RegionCollection = { type: 'FeatureCollection'; features: RegionFeature[] };

export function loadRegions(country: CountryCode): RegionFeature[] {
  switch (country) {
    case 'JP':
      return (require('./regions.jp.json') as RegionCollection).features;
    case 'KR':
      return (require('./regions.kr.json') as RegionCollection).features;
    case 'TH':
      return (require('./regions.th.json') as RegionCollection).features;
    default:
      return [];
  }
}

/**
 * Fill/collection units: city-boundary polygons for every country (KR 시,
 * JP 시구정촌 — Tokyo's 23 wards merged, TH 암프). `properties.name` is the
 * Korean display name; `regionId` points at the parent admin-1 region.
 */
export function loadFillUnits(country: CountryCode): RegionFeature[] {
  switch (country) {
    case 'JP':
      return (require('./cityareas.jp.json') as RegionCollection).features;
    case 'KR':
      return (require('./cityareas.kr.json') as RegionCollection).features;
    case 'TH':
      return (require('./cityareas.th.json') as RegionCollection).features;
    default:
      return [];
  }
}

/**
 * Backdrop polygons drawn under the fill units for full coverage, so the
 * countryside between collectable cities (KR 군, JP/TH rural districts) reads
 * as land instead of holes.
 */
export function loadBackground(country: CountryCode): RegionFeature[] {
  return loadRegions(country);
}

/** Countries that actually have data bundled (drives the country picker). */
export function availableCountries(): CountryCode[] {
  return (['KR', 'JP', 'TH'] as CountryCode[]).filter((c) => loadRegions(c).length > 0);
}

export interface ResolvedCheckin extends VerifyResult {
  country: CountryCode | null;
}

/**
 * Resolve a GPS point against every bundled country and return the matching
 * country + city area. Lets the user "check in here" without first picking a
 * country — the app figures out where they are.
 */
export function resolveCheckin(
  pos: Position | null,
  accuracyM: number | null,
  maxAccuracyM?: number,
): ResolvedCheckin {
  if (!pos) return { ok: false, reason: 'no-fix', regionId: null, country: null };
  let sawLowAccuracy = false;
  for (const country of availableCountries()) {
    const result = verifyCheckin({
      pos,
      accuracyM,
      regions: loadFillUnits(country),
      maxAccuracyM,
    });
    if (result.ok) return { ...result, country };
    if (result.reason === 'low-accuracy') sawLowAccuracy = true;
  }
  // No country matched: a coarse fix is more actionable to surface than "no-region".
  if (sawLowAccuracy) {
    return { ok: false, reason: 'low-accuracy', regionId: null, country: null };
  }
  return { ok: false, reason: 'no-region', regionId: null, country: null };
}
