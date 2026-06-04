/**
 * Check-in service — the core collection loop.
 *
 *   verifyCheckin (caller) ─▶ recordCheckin ─▶ enqueue (local, durable)
 *                                                  │
 *                                          flushQueue (when online)
 *                                                  ▼
 *                                  upsert visit_events (idempotent by id)
 *                                                  ▼
 *                              DB trigger aggregates into visits (re-visit++)
 *
 * Idempotency: the queued id IS the visit_event id. Re-flushing upserts the
 * same id with ignoreDuplicates, so a retry never double-counts a re-visit.
 *
 * Photo upload is added in the next sub-task (needs the expo-file-system v56
 * API verified first); the queue already carries photoUri for that.
 */
import * as Crypto from 'expo-crypto';

import { applyLocalCheckin } from '@/lib/localVisits';
import { supabase } from '@/lib/supabase';
import { enqueue, markFailed, markSynced, pending, type QueuedCheckin } from '@/lib/syncQueue';
import type { CountryCode, VisitSource } from '@/types/domain';

export interface RecordCheckinInput {
  userId: string;
  regionId: string;
  cityId: string | null;
  cityName: string | null;
  country: CountryCode;
  lat: number;
  lng: number;
  accuracyM: number | null;
  note: string | null;
  photoUri?: string | null;
  source?: VisitSource;
}

/** Persist a check-in locally, then attempt to sync. Returns the local id. */
export async function recordCheckin(input: RecordCheckinInput): Promise<string> {
  const id = Crypto.randomUUID();
  const checkin: QueuedCheckin = {
    id,
    userId: input.userId,
    regionId: input.regionId,
    cityId: input.cityId,
    cityName: input.cityName,
    country: input.country,
    createdAt: new Date().toISOString(),
    source: input.source ?? 'live',
    lat: input.lat,
    lng: input.lng,
    accuracyM: input.accuracyM,
    note: input.note,
  };
  await enqueue(checkin, input.photoUri ?? null);
  // Local-first: update the fill projection immediately so the map reflects the
  // new visit even with no backend / offline.
  await applyLocalCheckin(checkin.regionId, checkin.country, checkin.createdAt);
  // Fire-and-forget: the record is already durable; sync best-effort.
  void flushQueue();
  return id;
}

/** Upsert one queued check-in. Idempotent on id (ignoreDuplicates). */
async function syncOne(row: QueuedCheckin): Promise<void> {
  const { error } = await supabase.from('visit_events').upsert(
    {
      id: row.id,
      user_id: row.userId,
      region_id: row.regionId,
      city_id: row.cityId,
      city_name: row.cityName,
      country: row.country,
      created_at: row.createdAt,
      source: row.source,
      lat: row.lat,
      lng: row.lng,
      accuracy_m: row.accuracyM,
      note: row.note,
      photo_path: null,
    },
    { onConflict: 'id', ignoreDuplicates: true },
  );
  if (error) throw error;
}

/** Drain the offline queue. Safe to call repeatedly (e.g. on reconnect). */
export async function flushQueue(): Promise<{ synced: number; failed: number }> {
  const rows = await pending();
  let synced = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await syncOne(row);
      await markSynced(row.id);
      synced += 1;
    } catch (err) {
      await markFailed(row.id, err instanceof Error ? err.message : String(err));
      failed += 1;
    }
  }
  return { synced, failed };
}
