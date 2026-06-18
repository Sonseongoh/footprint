/**
 * Upload a check-in photo to Supabase Storage.
 *
 * Layout: photos/{userId}/{eventId}.jpg — the storage RLS scopes access by the
 * first folder segment (= auth.uid()), and the event id makes the path stable
 * so retries overwrite (upsert) instead of duplicating.
 *
 * File reading uses the SDK 56 File API (`new File(uri).arrayBuffer()` — the
 * legacy readAsStringAsync was removed from the main export).
 */
import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';

import { supabase } from '@/lib/supabase';

export async function uploadCheckinPhoto(
  userId: string,
  eventId: string,
  localUri: string,
): Promise<string> {
  const bytes = await new File(localUri).arrayBuffer();
  const path = `${userId}/${eventId}.jpg`;
  const { error } = await supabase.storage.from('photos').upload(path, bytes, {
    contentType: 'image/jpeg',
    upsert: true, // idempotent retries
  });
  if (error) throw error;
  return path;
}

/**
 * Upload a city-note photo to the PUBLIC `note-photos` bucket (note photos are
 * part of a public tip). Layout: note-photos/{userId}/{photoId}.jpg — folder is
 * the user id so storage RLS scopes writes to the author. Returns the path.
 */
export async function uploadNotePhoto(userId: string, localUri: string): Promise<string> {
  const bytes = await new File(localUri).arrayBuffer();
  const path = `${userId}/${Crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from('note-photos').upload(path, bytes, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw error;
  return path;
}

/** Public URL for a note photo path (the bucket is public — no signing needed). */
export function notePhotoUrl(path: string): string {
  return supabase.storage.from('note-photos').getPublicUrl(path).data.publicUrl;
}

/** Best-effort delete of a note photo (e.g. when a note is removed/replaced). */
export async function deleteNotePhoto(path: string): Promise<void> {
  await supabase.storage.from('note-photos').remove([path]);
}
