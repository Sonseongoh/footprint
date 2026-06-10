/**
 * Bundled reference data loader. Regions (admin-1 GeoJSON, simplified) and
 * major city points per country. Loaded per-country via require() so a country
 * the user never opens is not parsed.
 *
 * v1 ships Japan; Korea and Thailand are added as their data lands.
 */
import { verifyCheckin, type RegionFeature, type VerifyResult } from '@/lib/geo';
import type { CityPoint, CountryCode, Position } from '@/types/domain';

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

/** Curated extra cities (tourist spots GeoNames' admin-seat filter misses, e.g.
 *  Pattaya). Kept separate so the build script never clobbers them. */
function loadExtraCities(country: CountryCode): CityPoint[] {
  switch (country) {
    case 'KR':
      return require('./cities-extra.kr.json') as CityPoint[];
    case 'JP':
      return require('./cities-extra.jp.json') as CityPoint[];
    case 'TH':
      return require('./cities-extra.th.json') as CityPoint[];
    default:
      return [];
  }
}

export function loadCities(country: CountryCode): CityPoint[] {
  let base: CityPoint[];
  switch (country) {
    case 'JP':
      base = require('./cities.jp.json') as CityPoint[];
      break;
    case 'KR':
      base = require('./cities.kr.json') as CityPoint[];
      break;
    case 'TH':
      base = require('./cities.th.json') as CityPoint[];
      break;
    default:
      base = [];
  }
  return [...base, ...loadExtraCities(country)];
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
 * country + region + city. Lets the user "check in here" without first picking
 * a country — the app figures out where they are.
 */
export function resolveCheckin(
  pos: Position | null,
  accuracyM: number | null,
  maxAccuracyM?: number,
): ResolvedCheckin {
  if (!pos) return { ok: false, reason: 'no-fix', regionId: null, city: null, country: null };
  let sawLowAccuracy = false;
  for (const country of availableCountries()) {
    const result = verifyCheckin({
      pos,
      accuracyM,
      regions: loadRegions(country),
      cities: loadCities(country),
      maxAccuracyM,
    });
    if (result.ok) return { ...result, country };
    if (result.reason === 'low-accuracy') sawLowAccuracy = true;
  }
  // No country matched: a coarse fix is more actionable to surface than "no-region".
  if (sawLowAccuracy) {
    return { ok: false, reason: 'low-accuracy', regionId: null, city: null, country: null };
  }
  return { ok: false, reason: 'no-region', regionId: null, city: null, country: null };
}
