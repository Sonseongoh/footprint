/**
 * Collection stats for the 내 발자국 screen. Filled counts come from the local
 * projection (same source as the fill map) so the numbers match what the map
 * shows: visited city areas (the fill units) per country.
 */
import { availableCountries, loadFillUnits } from '@/data';
import { getLocalVisitsByRegion } from '@/lib/localVisits';
import type { CountryCode } from '@/types/domain';

export interface CountryStat {
  country: CountryCode;
  filled: number;
  total: number;
}

export interface CollectionStats {
  perCountry: CountryStat[];
  /** countries with at least one filled city */
  countriesVisited: number;
  /** total filled cities across all countries */
  totalFilled: number;
}

export async function getCollectionStats(): Promise<CollectionStats> {
  const perCountry: CountryStat[] = [];
  for (const country of availableCountries()) {
    const fillUnits = loadFillUnits(country);
    const visits = await getLocalVisitsByRegion(country);
    const filled = fillUnits.filter((r) => visits[r.properties.id]).length;
    perCountry.push({ country, filled, total: fillUnits.length });
  }
  return {
    perCountry,
    countriesVisited: perCountry.filter((s) => s.filled > 0).length,
    totalFilled: perCountry.reduce((a, s) => a + s.filled, 0),
  };
}
