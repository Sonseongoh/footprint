/**
 * Check-in records for the timeline screen.
 *
 * Merges synced events (server, photos via short-lived signed URLs — the photos
 * bucket is private) with still-pending offline queue rows (local photo uris),
 * newest first.
 *
 * Offline: the last successful server result is cached per user (traveling
 * without data is this app's normal condition — the timeline must not read as
 * "no records"). Cached rows render without photos (signed URLs expire and
 * can't load offline anyway); `offline: true` lets the screen say so.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

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

export interface RecordsResult {
  records: CheckinRecord[];
  /** true when the server was unreachable and synced rows came from the cache */
  offline: boolean;
}

const SIGNED_URL_TTL_S = 60 * 60;
const CACHE_PREFIX = 'records_cache_v1:';

/** What we persist per synced row — no signed URLs (they expire in an hour). */
type CachedRow = Omit<CheckinRecord, 'photoUrls' | 'pendingSync'> & { hasPhotos: boolean };

export async function getRecords(): Promise<RecordsResult> {
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
  let offline = false;
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

    const cache: CachedRow[] = [];
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
      cache.push({
        id: r.id,
        country: r.country as CountryCode,
        regionId: r.region_id,
        cityName: r.city_name,
        note: r.note,
        createdAt: r.created_at,
        hasPhotos: paths.length > 0,
      });
    }
    // remember this result for the next offline launch (per user — keyed so an
    // account switch can never show someone else's cached timeline)
    if (myId) {
      void AsyncStorage.setItem(CACHE_PREFIX + myId, JSON.stringify(cache)).catch(() => {});
    }
  } catch {
    // offline / backend unreachable — fall back to the last synced snapshot
    offline = true;
    if (myId) {
      try {
        const raw = await AsyncStorage.getItem(CACHE_PREFIX + myId);
        const cached: CachedRow[] = raw ? JSON.parse(raw) : [];
        for (const r of cached) {
          if (queuedIds.has(r.id)) continue;
          out.push({ ...r, photoUrls: [], pendingSync: false });
        }
      } catch {
        // corrupted/missing cache — show queue rows only
      }
    }
  }

  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return { records: out, offline };
}
