/**
 * City notes — public "what's here / tips" attached to a place (country +
 * region_id). Anyone reads them; only someone who checked in at that place
 * within the last 7 days may write (enforced server-side by RLS, see
 * 0007_city_notes.sql). This module also exposes the same 7-day window to the
 * client so the UI can show eligibility + a countdown before the write fails.
 */
import { deleteNotePhoto, notePhotoUrl, uploadNotePhoto } from '@/lib/photoUpload';
import { getNicknames } from '@/lib/profile';
import { supabase } from '@/lib/supabase';
import type { CountryCode } from '@/types/domain';

/** Days after a check-in during which you may write/edit a note for that place. */
export const WRITE_WINDOW_DAYS = 7;
const WINDOW_MS = WRITE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** Max photos attachable to one note. */
export const MAX_NOTE_PHOTOS = 5;

/** How many notes to fetch per page (infinite scroll). */
export const NOTES_PAGE_SIZE = 15;

/** Sort order for the public 여행 공유 list. */
export type NoteSort = 'recent' | 'popular';

export interface CityNote {
  id: string;
  userId: string;
  country: CountryCode;
  regionId: string;
  cityName: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
  /** storage paths of attached photos (note-photos bucket), in display order */
  photoPaths: string[];
  /** public URLs for the photos, ready to render (same order as photoPaths) */
  photoUrls: string[];
  /** author display name (falls back to '방문자' when no profile yet) */
  authorNickname: string;
  /** true when this note belongs to the signed-in user */
  mine: boolean;
  /** number of likes */
  likeCount: number;
  /** whether the signed-in user has liked this note */
  likedByMe: boolean;
}

export interface WriteEligibility {
  eligible: boolean;
  /** most recent check-in at this place, if any */
  lastVisitAt: string | null;
  /** when the write window closes (lastVisitAt + 7d), if currently eligible */
  expiresAt: string | null;
}

/**
 * One page of public notes for a place. `sort` is 신규순(recent) or 추천순(popular,
 * by like count); `offset` drives infinite scroll. Resolves author nicknames and
 * the signed-in user's like state per note.
 */
export async function getCityNotes(
  country: CountryCode,
  regionId: string,
  opts: { sort: NoteSort; offset: number; limit?: number },
): Promise<CityNote[]> {
  const limit = opts.limit ?? NOTES_PAGE_SIZE;
  const { data: session } = await supabase.auth.getSession();
  const myId = session.session?.user?.id ?? null;

  let q = supabase
    .from('city_notes')
    .select('id, user_id, country, region_id, city_name, body, created_at, updated_at, photo_paths, like_count')
    .eq('country', country)
    .eq('region_id', regionId)
    .eq('is_visible', true);
  q =
    opts.sort === 'popular'
      ? q.order('like_count', { ascending: false }).order('created_at', { ascending: false })
      : q.order('created_at', { ascending: false });
  const { data, error } = await q.range(opts.offset, opts.offset + limit - 1);
  if (error || !data) return [];

  const ids = data.map((r) => r.id);
  const [nicks, liked] = await Promise.all([
    getNicknames(data.map((r) => r.user_id)),
    likedNoteIds(myId, ids),
  ]);

  return data.map((r) => {
    const paths: string[] = r.photo_paths ?? [];
    return {
      id: r.id,
      userId: r.user_id,
      country: r.country as CountryCode,
      regionId: r.region_id,
      cityName: r.city_name,
      body: r.body,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      photoPaths: paths,
      photoUrls: paths.map(notePhotoUrl),
      authorNickname: nicks.get(r.user_id) ?? '방문자',
      mine: r.user_id === myId,
      likeCount: r.like_count ?? 0,
      likedByMe: liked.has(r.id),
    };
  });
}

/** Total number of visible notes for a place (for the header count). */
export async function getCityNoteCount(country: CountryCode, regionId: string): Promise<number> {
  const { count } = await supabase
    .from('city_notes')
    .select('id', { count: 'exact', head: true })
    .eq('country', country)
    .eq('region_id', regionId)
    .eq('is_visible', true);
  return count ?? 0;
}

/** Which of the given note ids the user has liked. */
async function likedNoteIds(userId: string | null, noteIds: string[]): Promise<Set<string>> {
  if (!userId || noteIds.length === 0) return new Set();
  const { data } = await supabase
    .from('city_note_likes')
    .select('note_id')
    .eq('user_id', userId)
    .in('note_id', noteIds);
  return new Set((data ?? []).map((l) => l.note_id));
}

/** Like or unlike a note (`liked` = the desired new state). */
export async function toggleLike(noteId: string, liked: boolean): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user?.id;
  if (!userId) throw new Error('로그인(백엔드 연결)이 필요합니다');
  if (liked) {
    const { error } = await supabase
      .from('city_note_likes')
      .insert({ note_id: noteId, user_id: userId });
    // ignore duplicate (already liked)
    if (error && !/duplicate key/i.test(error.message)) throw error;
  } else {
    const { error } = await supabase
      .from('city_note_likes')
      .delete()
      .eq('note_id', noteId)
      .eq('user_id', userId);
    if (error) throw error;
  }
}

/**
 * Whether the signed-in user may write a note here, based on their most recent
 * check-in to this place. Mirrors the RLS gate so the UI can explain/lock the
 * compose box (the DB remains the source of truth and will reject a stale write).
 */
export async function getWriteEligibility(
  country: CountryCode,
  regionId: string,
): Promise<WriteEligibility> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user?.id;
  if (!userId) return { eligible: false, lastVisitAt: null, expiresAt: null };

  const { data } = await supabase
    .from('visit_events')
    .select('created_at')
    .eq('user_id', userId)
    .eq('country', country)
    .eq('region_id', regionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastVisitAt = data?.created_at ?? null;
  if (!lastVisitAt) return { eligible: false, lastVisitAt: null, expiresAt: null };

  const expires = new Date(lastVisitAt).getTime() + WINDOW_MS;
  const eligible = Date.now() < expires;
  return {
    eligible,
    lastVisitAt,
    expiresAt: eligible ? new Date(expires).toISOString() : null,
  };
}

/**
 * Place keys (`${country}:${regionId}`) the signed-in user has written a note
 * for — lets the records timeline mark check-ins that already have a note.
 */
export async function getMyNotedPlaceKeys(): Promise<Set<string>> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user?.id;
  if (!userId) return new Set();
  const { data } = await supabase.from('city_notes').select('country, region_id').eq('user_id', userId);
  const out = new Set<string>();
  for (const r of data ?? []) out.add(`${r.country}:${r.region_id}`);
  return out;
}

/** All of the signed-in user's 여행 공유, newest first (for the 내 발자국 screen). */
export async function getMyNotes(): Promise<CityNote[]> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user?.id;
  if (!userId) return [];
  const { data } = await supabase
    .from('city_notes')
    .select('id, user_id, country, region_id, city_name, body, created_at, updated_at, photo_paths, like_count')
    .eq('user_id', userId)
    .eq('is_visible', true)
    .order('created_at', { ascending: false })
    .limit(100);
  if (!data) return [];
  return data.map((r) => {
    const paths: string[] = r.photo_paths ?? [];
    return {
      id: r.id,
      userId: r.user_id,
      country: r.country as CountryCode,
      regionId: r.region_id,
      cityName: r.city_name,
      body: r.body,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      photoPaths: paths,
      photoUrls: paths.map(notePhotoUrl),
      authorNickname: '나',
      mine: true,
      likeCount: r.like_count ?? 0,
      likedByMe: false,
    };
  });
}

/** The signed-in user's own note for this place (one per place in the UI), if any. */
export async function getMyNote(country: CountryCode, regionId: string): Promise<CityNote | null> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user?.id;
  if (!userId) return null;
  const { data } = await supabase
    .from('city_notes')
    .select('id, user_id, country, region_id, city_name, body, created_at, updated_at, photo_paths, like_count')
    .eq('user_id', userId)
    .eq('country', country)
    .eq('region_id', regionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const paths: string[] = data.photo_paths ?? [];
  return {
    id: data.id,
    userId: data.user_id,
    country: data.country as CountryCode,
    regionId: data.region_id,
    cityName: data.city_name,
    body: data.body,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    photoPaths: paths,
    photoUrls: paths.map(notePhotoUrl),
    authorNickname: '나',
    mine: true,
    likeCount: data.like_count ?? 0,
    likedByMe: false,
  };
}

function friendlyWriteError(message: string): Error {
  // RLS rejection (no recent visit) surfaces as a generic policy violation
  if (/row-level security|policy/i.test(message)) {
    return new Error('이 도시에 최근 7일 내 체크인한 사람만 여행 공유를 남길 수 있어요');
  }
  return new Error(message);
}

async function uploadAll(userId: string, uris: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const uri of uris) out.push(await uploadNotePhoto(userId, uri));
  return out;
}

export async function postCityNote(input: {
  country: CountryCode;
  regionId: string;
  cityName: string | null;
  body: string;
  /** local uris of photos to attach (uploaded to the public note-photos bucket) */
  photoUris?: string[];
}): Promise<void> {
  const body = input.body.trim();
  if (body.length < 1 || body.length > 500) throw new Error('여행 공유는 1~500자로 입력해주세요');
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user?.id;
  if (!userId) throw new Error('로그인(백엔드 연결)이 필요합니다');

  const photoPaths = await uploadAll(userId, (input.photoUris ?? []).slice(0, MAX_NOTE_PHOTOS));

  const { error } = await supabase.from('city_notes').insert({
    user_id: userId,
    country: input.country,
    region_id: input.regionId,
    city_name: input.cityName,
    body,
    photo_paths: photoPaths,
  });
  if (error) {
    for (const p of photoPaths) await deleteNotePhoto(p); // don't orphan uploads
    throw friendlyWriteError(error.message);
  }
}

/**
 * Update a note's text and photos. The final photo set is `keepPaths` (existing
 * photos kept, in order) followed by freshly uploaded `newPhotoUris`. Any
 * previously-attached photo not in `keepPaths` is deleted from storage.
 */
export async function updateCityNote(
  id: string,
  body: string,
  opts: { newPhotoUris?: string[]; keepPaths?: string[]; prevPaths?: string[] } = {},
): Promise<void> {
  const trimmed = body.trim();
  if (trimmed.length < 1 || trimmed.length > 500) throw new Error('메모는 1~500자로 입력해주세요');
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user?.id;
  if (!userId) throw new Error('로그인(백엔드 연결)이 필요합니다');

  const keep = opts.keepPaths ?? [];
  const room = Math.max(0, MAX_NOTE_PHOTOS - keep.length);
  const uploaded = await uploadAll(userId, (opts.newPhotoUris ?? []).slice(0, room));
  const photoPaths = [...keep, ...uploaded];

  const { error } = await supabase
    .from('city_notes')
    .update({ body: trimmed, photo_paths: photoPaths, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    for (const p of uploaded) await deleteNotePhoto(p);
    throw friendlyWriteError(error.message);
  }
  // delete any previously-attached photo the user dropped (best-effort)
  for (const p of opts.prevPaths ?? []) {
    if (!keep.includes(p)) await deleteNotePhoto(p);
  }
}

export async function deleteCityNote(id: string): Promise<void> {
  const { error } = await supabase.from('city_notes').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Report a 여행 공유 as abusive. One report per user per note (duplicates are a
 * no-op). Enough distinct reports auto-hides the note server-side (see
 * 0012_note_reports.sql). `reason` is optional free text.
 */
export async function reportNote(noteId: string, reason?: string): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user?.id;
  if (!userId) throw new Error('로그인(백엔드 연결)이 필요합니다');
  const { error } = await supabase
    .from('city_note_reports')
    .insert({ note_id: noteId, reporter_id: userId, reason: reason ?? null });
  // already reported → treat as success (idempotent from the user's view)
  if (error && !/duplicate key/i.test(error.message)) throw new Error(error.message);
}
