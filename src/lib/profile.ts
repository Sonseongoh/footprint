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

/** Thrown when a nickname is already taken (DB unique index, 0016). */
export class NicknameTakenError extends Error {
  constructor() {
    super('이미 사용 중인 닉네임이에요');
    this.name = 'NicknameTakenError';
  }
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

// Playful travel-themed pools for auto-generated nicknames — no personal info
// (email/real name) leaks into a public author label this way.
const NICK_ADJECTIVES = [
  '느긋한', '설레는', '씩씩한', '부지런한', '잔잔한', '포근한', '상냥한', '용감한',
  '다정한', '엉뚱한', '든든한', '반짝이는', '은은한', '따뜻한', '산뜻한', '활기찬',
  '고요한', '햇살같은',
];
const NICK_NOUNS = [
  '나그네', '여우', '펭귄', '수달', '고래', '참새', '다람쥐', '두더지', '사슴',
  '판다', '너구리', '올빼미', '고슴도치', '바다표범', '알파카', '코알라', '두루미', '해달',
];

/** A random, non-identifying nickname like "느긋한너구리482". */
export function randomNickname(): string {
  const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
  const num = 100 + Math.floor(Math.random() * 900);
  return `${pick(NICK_ADJECTIVES)}${pick(NICK_NOUNS)}${num}`;
}

/**
 * Ensure the signed-in (real) user has a nickname, assigning a random one on
 * first account creation so they never face a blank author field. No-op for
 * guests (they can't post) and for users who already picked one. Returns the
 * effective nickname, or null when not applicable.
 */
export async function ensureNickname(): Promise<string | null> {
  const { data: session } = await supabase.auth.getSession();
  const user = session.session?.user;
  if (!user || user.is_anonymous) return null; // guests get no nickname
  const existing = await getMyProfile();
  if (existing?.nickname) return existing.nickname;
  // retry on the (rare) collision — a fresh random number almost always clears it
  for (let i = 0; i < 8; i++) {
    try {
      return (await setMyNickname(randomNickname())).nickname;
    } catch (e) {
      if (e instanceof NicknameTakenError) continue;
      return null; // other error — first post still prompts inline as a fallback
    }
  }
  return null;
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
  if (error) {
    // 23505 = unique_violation (profiles_display_name_unique, 0016)
    if (error.code === '23505' || /duplicate key|unique/i.test(error.message)) {
      throw new NicknameTakenError();
    }
    throw error;
  }
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
