/**
 * Local-first visits projection.
 *
 * Mirrors the server's `visits` aggregate in SQLite so the fill map updates
 * instantly and works offline, before sync (and independent of whether a
 * backend is configured). On every check-in, applyLocalCheckin upserts the
 * region's count — the same re-visit accumulation the server trigger does.
 */
import { getDb } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import type { CountryCode, Visit } from '@/types/domain';

export async function applyLocalCheckin(
  regionId: string,
  country: CountryCode,
  whenIso: string,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO visits_local (region_id, country, first_visited_at, last_visited_at, visit_count)
     VALUES (?, ?, ?, ?, 1)
     ON CONFLICT(region_id) DO UPDATE SET
       visit_count = visit_count + 1,
       last_visited_at = MAX(last_visited_at, excluded.last_visited_at)`,
    regionId,
    country,
    whenIso,
    whenIso,
  );
}

/** Wipe the local fill projection — used when switching accounts so one user's
 *  map doesn't bleed into another's on the same device. */
export async function clearLocalVisits(): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM visits_local');
  await db.runAsync('DELETE FROM visits_city_local');
}

/**
 * Rebuild the local fill projection from the server for the signed-in user, so
 * after an account switch the globe/map/stats immediately show that account's
 * existing visits (the records tab reads the server directly, but the fill map
 * is local-first). Fills come from the server `visits` aggregate — its
 * region_id IS the city-area id. No-op when signed out / offline.
 */
export async function hydrateLocalFromServer(): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user?.id;
  if (!userId) return;

  const { data: visits } = await supabase
    .from('visits')
    .select('region_id, country, first_visited_at, last_visited_at, visit_count')
    .eq('user_id', userId);

  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM visits_local');
    await db.runAsync('DELETE FROM visits_city_local');
    for (const v of visits ?? []) {
      await db.runAsync(
        `INSERT OR REPLACE INTO visits_local (region_id, country, first_visited_at, last_visited_at, visit_count)
         VALUES (?, ?, ?, ?, ?)`,
        v.region_id,
        v.country,
        v.first_visited_at,
        v.last_visited_at,
        v.visit_count,
      );
    }
  });
}

/** True if the user has made any check-in at all (drives first-run onboarding). */
export async function hasAnyVisit(): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) as n FROM visits_local');
  return (row?.n ?? 0) > 0;
}

/** Countries with at least one local check-in (drives the entry globe's fill). */
export async function getVisitedCountries(): Promise<Set<CountryCode>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ country: CountryCode }>(
    'SELECT DISTINCT country FROM visits_local',
  );
  return new Set(rows.map((r) => r.country));
}

/** Local visited regions for a country, keyed by regionId (for the fill map). */
export async function getLocalVisitsByRegion(
  country: CountryCode,
): Promise<Record<string, Visit>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    region_id: string;
    country: CountryCode;
    first_visited_at: string;
    last_visited_at: string;
    visit_count: number;
  }>('SELECT * FROM visits_local WHERE country = ?', country);

  const out: Record<string, Visit> = {};
  for (const r of rows) {
    out[r.region_id] = {
      id: r.region_id,
      userId: 'local',
      regionId: r.region_id,
      country: r.country,
      firstVisitedAt: r.first_visited_at,
      lastVisitedAt: r.last_visited_at,
      visitCount: r.visit_count,
    };
  }
  return out;
}
