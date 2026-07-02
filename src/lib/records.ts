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
  /** displayable image sources (signed urls or local file uris), 0+ */
  photoUrls: string[];
  /** true while the row is still waiting in the offline queue */
  pendingSync: boolean;
}

const SIGNED_URL_TTL_S = 60 * 60;

export async function getRecords(): Promise<CheckinRecord[]> {
  const out: CheckinRecord[] = [];

  // still-unsynced local check-ins (photo is a local file uri). The queue can
  // hold rows stranded by a signed-out owner (flushQueue skips them) — show
  // only the current user's rows, mirroring the flush ownership rule.
  const { data: session } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
  const myId = session.session?.user?.id ?? null;
  const queued = (await pending()).filter(
    (q) => q.userId === myId || q.userId === 'local-only',
  );
  for (const q of queued) {
    out.push({
      id: q.id,
      country: q.country,
      regionId: q.regionId,
      cityName: q.cityName,
      note: q.note,
      createdAt: q.createdAt,
      photoUrls: q.photoUris,
      pendingSync: true,
    });
  }
  const queuedIds = new Set(queued.map((q) => q.id));

  // synced events from the server (skip ones still in the queue to avoid dupes)
  try {
    const { data, error } = await supabase
      .from('visit_events')
      .select('id, country, region_id, city_name, note, created_at, photo_paths')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;

    const rows = (data ?? []).filter((r) => !queuedIds.has(r.id));
    const allPaths = rows.flatMap((r) => (r.photo_paths ?? []) as string[]);
    const signed = new Map<string, string>();
    if (allPaths.length > 0) {
      const { data: urls } = await supabase.storage
        .from('photos')
        .createSignedUrls(allPaths, SIGNED_URL_TTL_S);
      for (const u of urls ?? []) {
        if (u.signedUrl && u.path) signed.set(u.path, u.signedUrl);
      }
    }

    for (const r of rows) {
      const paths: string[] = r.photo_paths ?? [];
      out.push({
        id: r.id,
        country: r.country as CountryCode,
        regionId: r.region_id,
        cityName: r.city_name,
        note: r.note,
        createdAt: r.created_at,
        photoUrls: paths.map((p) => signed.get(p)).filter((u): u is string => Boolean(u)),
        pendingSync: false,
      });
    }
  } catch {
    // offline / backend unreachable — show local rows only
  }

  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return out;
}
