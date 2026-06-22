/**
 * Offline check-in queue mechanics (durable, expo-sqlite).
 *
 * Every check-in is enqueued locally first. `flushQueue` (in checkinService)
 * drains it when online. Each row carries a client-generated id used as the
 * Supabase visit_event id, so a re-sent row upserts to the same id and never
 * double-counts a re-visit.
 */
import { getDb } from '@/lib/db';
import type { CountryCode, VisitSource } from '@/types/domain';

/** The data captured at check-in time, before it reaches the server. */
export interface QueuedCheckin {
  id: string;
  userId: string;
  regionId: string;
  cityId: string | null;
  cityName: string | null;
  country: CountryCode;
  createdAt: string;
  source: VisitSource;
  lat: number;
  lng: number;
  accuracyM: number | null;
  note: string | null;
}

export interface QueueRow extends QueuedCheckin {
  /** local uris of the check-in photos (0+). */
  photoUris: string[];
  attempts: number;
}

/** Parse the photo_uri column, which now holds a JSON array. Tolerates the old
 *  single-uri (non-JSON) format from rows enqueued before multi-photo. */
function parsePhotoUris(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [raw];
  } catch {
    return [raw];
  }
}

export async function enqueue(checkin: QueuedCheckin, photoUris: string[]): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR IGNORE INTO checkin_queue (id, payload, photo_uri, created_at, attempts) VALUES (?, ?, ?, ?, 0)',
    checkin.id,
    JSON.stringify(checkin),
    JSON.stringify(photoUris),
    checkin.createdAt,
  );
}

export async function pending(): Promise<QueueRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: string;
    payload: string;
    photo_uri: string | null;
    attempts: number;
  }>('SELECT id, payload, photo_uri, attempts FROM checkin_queue ORDER BY created_at ASC');
  return rows.map((r) => ({
    ...(JSON.parse(r.payload) as QueuedCheckin),
    photoUris: parsePhotoUris(r.photo_uri),
    attempts: r.attempts,
  }));
}

export async function pendingCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) as n FROM checkin_queue');
  return row?.n ?? 0;
}

/** Remove a row once it is confirmed persisted server-side. */
export async function markSynced(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM checkin_queue WHERE id = ?', id);
}

/** Record a failed sync attempt so retries are visible and bounded. */
export async function markFailed(id: string, error: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE checkin_queue SET attempts = attempts + 1, last_error = ? WHERE id = ?',
    error,
    id,
  );
}
