/**
 * Read the visited regions for the home/country fill map.
 *
 * Returns a map of regionId -> visit aggregate so the map can colour filled
 * vs unfilled regions and show re-visit depth. Only `visits` (fill + counts)
 * is read here — never visit_events (private notes/gps/photos).
 */
import { supabase } from '@/lib/supabase';
import type { CountryCode, Visit } from '@/types/domain';

type VisitRow = {
  id: string;
  user_id: string;
  region_id: string;
  country: CountryCode;
  first_visited_at: string;
  last_visited_at: string;
  visit_count: number;
};

function toVisit(r: VisitRow): Visit {
  return {
    id: r.id,
    userId: r.user_id,
    regionId: r.region_id,
    country: r.country,
    firstVisitedAt: r.first_visited_at,
    lastVisitedAt: r.last_visited_at,
    visitCount: r.visit_count,
  };
}

/** All of the signed-in user's visits for a country, keyed by regionId. */
export async function getVisitsByRegion(
  country: CountryCode,
): Promise<Record<string, Visit>> {
  const { data, error } = await supabase
    .from('visits')
    .select('*')
    .eq('country', country);
  if (error) throw error;
  const out: Record<string, Visit> = {};
  for (const row of (data ?? []) as VisitRow[]) {
    out[row.region_id] = toVisit(row);
  }
  return out;
}

/** Visits for a public share page (resolved by userId+country via RLS). */
export async function getPublicVisitsByRegion(
  userId: string,
  country: CountryCode,
): Promise<Record<string, Visit>> {
  const { data, error } = await supabase
    .from('visits')
    .select('*')
    .eq('user_id', userId)
    .eq('country', country);
  if (error) throw error;
  const out: Record<string, Visit> = {};
  for (const row of (data ?? []) as VisitRow[]) {
    out[row.region_id] = toVisit(row);
  }
  return out;
}
