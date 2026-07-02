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
 * A check-in can carry 0+ photos (uploaded to the private photos bucket, stored
 * as visit_events.photo_paths); the queue holds their local uris until sync.
 */
import * as Crypto from 'expo-crypto';

import { applyLocalCheckin, applyLocalCityVisit } from '@/lib/localVisits';
import { uploadCheckinPhotos } from '@/lib/photoUpload';
import { supabase } from '@/lib/supabase';
import {
  enqueue,
  markFailed,
  markSynced,
  pending,
  type QueuedCheckin,
  type QueueRow,
} from '@/lib/syncQueue';
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
  photoUris?: string[];
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
  await enqueue(checkin, input.photoUris ?? []);
  // Local-first: update the fill projections immediately so the map reflects the
  // new visit even with no backend / offline.
  await applyLocalCheckin(checkin.regionId, checkin.country, checkin.createdAt);
  if (checkin.cityId) {
    await applyLocalCityVisit(checkin.cityId, checkin.country, checkin.createdAt);
  }
  // Fire-and-forget: the record is already durable; sync best-effort.
  void flushQueue();
  return id;
}

/**
 * Sync one queued check-in: upload its photo (if any) to Storage first, then
 * upsert the event row with photo_paths. Idempotent on id — merge-upsert is safe
 * because the visits aggregate trigger fires on INSERT only, so a retried row
 * updates photo_paths without double-counting the re-visit.
 */
async function syncOne(row: QueueRow, userId: string): Promise<void> {
  const photoPaths =
    row.photoUris.length > 0 ? await uploadCheckinPhotos(userId, row.id, row.photoUris) : [];
  const { error } = await supabase.from('visit_events').upsert(
    {
      id: row.id,
      // authoritative session user — queue rows recorded before the backend was
      // configured carry 'local-only' and would otherwise never sync (RLS)
      user_id: userId,
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
      photo_paths: photoPaths,
    },
    { onConflict: 'id' },
  );
  if (error) throw error;
}

/** Drain the offline queue. Safe to call repeatedly (e.g. on reconnect). */
export async function flushQueue(): Promise<{ synced: number; failed: number }> {
  const rows = await pending();
  if (rows.length === 0) return { synced: 0, failed: 0 };

  // can't sync without a session (offline / backend not configured yet)
  const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
  const userId = data.session?.user?.id;
  if (!userId) return { synced: 0, failed: rows.length };

  let synced = 0;
  let failed = 0;
  for (const row of rows) {
    // A footprint belongs to whoever made it. A row queued under a different
    // account (e.g. checked in offline as A, then switched to B) must NOT be
    // attributed to the current user — leave it queued until its owner signs
    // back in. ('local-only' rows predate the login gate; adopt them.)
    if (row.userId !== userId && row.userId !== 'local-only') continue;
    try {
      await syncOne(row, userId);
      await markSynced(row.id);
      synced += 1;
    } catch (err) {
      await markFailed(row.id, err instanceof Error ? err.message : String(err));
      failed += 1;
    }
  }
  return { synced, failed };
}
