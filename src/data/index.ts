/**
 * Bundled reference data loader. Regions (admin-1 GeoJSON, simplified) and
 * major city points per country. Loaded per-country via require() so a country
 * the user never opens is not parsed.
 *
 * v1 ships Japan; Korea and Thailand are added as their data lands.
 */
import type { RegionFeature } from '@/lib/geo';
import type { CityPoint, CountryCode } from '@/types/domain';

type RegionCollection = { type: 'FeatureCollection'; features: RegionFeature[] };

export function loadRegions(country: CountryCode): RegionFeature[] {
  switch (country) {
    case 'JP':
      return (require('./regions.jp.json') as RegionCollection).features;
    case 'KR':
    case 'TH':
      return []; // TODO: add admin-1 GeoJSON for KR / TH
    default:
      return [];
  }
}

export function loadCities(country: CountryCode): CityPoint[] {
  switch (country) {
    case 'JP':
      return require('./cities.jp.json') as CityPoint[];
    case 'KR':
    case 'TH':
      return [];
    default:
      return [];
  }
}

/** Countries that actually have data bundled (drives the country picker). */
export function availableCountries(): CountryCode[] {
  return (['JP', 'KR', 'TH'] as CountryCode[]).filter((c) => loadRegions(c).length > 0);
}
