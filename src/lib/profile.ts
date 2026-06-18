/**
 * Public profile (display nickname). Shown as the author of city notes. The
 * nickname is the only thing other users see about an author; it's required
 * before posting a note.
 *
 * Backed by the existing `profiles` table (PK id, column display_name) — the row
 * is auto-created per user on signup (handle_new_user), so we only ever UPDATE
 * display_name, never insert. Public read is granted by 0006_profiles.sql.
 */
import { supabase } from '@/lib/supabase';

export interface Profile {
  userId: string;
  nickname: string;
}

/** The signed-in user's profile, or null if they haven't set a nickname yet. */
export async function getMyProfile(): Promise<Profile | null> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user?.id;
  if (!userId) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data?.display_name) return null;
  return { userId, nickname: data.display_name };
}

/** Set the signed-in user's nickname (display_name). */
export async function setMyNickname(nickname: string): Promise<Profile> {
  const trimmed = nickname.trim();
  if (trimmed.length < 1 || trimmed.length > 24) {
    throw new Error('닉네임은 1~24자로 입력해주세요');
  }
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user?.id;
  if (!userId) throw new Error('로그인(백엔드 연결)이 필요합니다');

  // the profiles row already exists (created by the signup trigger) — update it
  const { error } = await supabase
    .from('profiles')
    .update({ display_name: trimmed })
    .eq('id', userId);
  if (error) throw error;
  return { userId, nickname: trimmed };
}

/** Batch-resolve nicknames for a set of user ids (for rendering note authors). */
export async function getNicknames(userIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return out;
  const { data } = await supabase.from('profiles').select('id, display_name').in('id', unique);
  for (const p of data ?? []) if (p.display_name) out.set(p.id, p.display_name);
  return out;
}
