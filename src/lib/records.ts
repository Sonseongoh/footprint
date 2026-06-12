/**
 * Check-in records for the timeline screen.
 *
 * Merges synced events (server, photos via short-lived signed URLs — the photos
 * bucket is private) with still-pending offline queue rows (local photo uris),
 * newest first.
 */
import { pending } from '@/lib/syncQueue';
import { supabase } from '@/lib/supabase';
import type { CountryCode } from '@/types/domain';

export interface CheckinRecord {
  id: string;
  country: CountryCode;
  regionId: string;
  cityName: string | null;
  note: string | null;
  createdAt: string;
  /** displayable image source (signed url or local file uri), if any */
  photoUrl: string | null;
  /** true while the row is still waiting in the offline queue */
  pendingSync: boolean;
}

const SIGNED_URL_TTL_S = 60 * 60;

export async function getRecords(): Promise<CheckinRecord[]> {
  const out: CheckinRecord[] = [];

  // still-unsynced local check-ins (photo is a local file uri)
  const queued = await pending();
  for (const q of queued) {
    out.push({
      id: q.id,
      country: q.country,
      regionId: q.regionId,
      cityName: q.cityName,
      note: q.note,
      createdAt: q.createdAt,
      photoUrl: q.photoUri,
      pendingSync: true,
    });
  }
  const queuedIds = new Set(queued.map((q) => q.id));

  // synced events from the server (skip ones still in the queue to avoid dupes)
  try {
    const { data, error } = await supabase
      .from('visit_events')
      .select('id, country, region_id, city_name, note, created_at, photo_path')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;

    const rows = (data ?? []).filter((r) => !queuedIds.has(r.id));
    const photoPaths = rows.map((r) => r.photo_path).filter((p): p is string => Boolean(p));
    const signed = new Map<string, string>();
    if (photoPaths.length > 0) {
      const { data: urls } = await supabase.storage
        .from('photos')
        .createSignedUrls(photoPaths, SIGNED_URL_TTL_S);
      for (const u of urls ?? []) {
        if (u.signedUrl && u.path) signed.set(u.path, u.signedUrl);
      }
    }

    for (const r of rows) {
      out.push({
        id: r.id,
        country: r.country as CountryCode,
        regionId: r.region_id,
        cityName: r.city_name,
        note: r.note,
        createdAt: r.created_at,
        photoUrl: r.photo_path ? (signed.get(r.photo_path) ?? null) : null,
        pendingSync: false,
      });
    }
  } catch {
    // offline / backend unreachable — show local rows only
  }

  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return out;
}
