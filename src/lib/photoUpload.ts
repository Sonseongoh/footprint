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
