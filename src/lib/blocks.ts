/**
 * User blocking (Play/App Store UGC requirement: report AND block).
 * A block hides the blocked author's 여행 공유 from MY feed only — nothing is
 * deleted and the other user isn't notified. Rows live in user_blocks (RLS:
 * own rows only), so the list survives reinstalls and follows the account.
 */
import { getNicknames } from '@/lib/profile';
import { supabase } from '@/lib/supabase';

/**
 * The block list barely ever changes, but every 여행 공유 fetch needs it (to
 * filter blocked authors) — re-querying it on each sort toggle / page made the
 * list feel sluggish. Cache it per user in memory; every mutation below
 * invalidates it, and signing out drops it.
 */
let cache: { userId: string; ids: Set<string> } | null = null;

/** Drop the cached block list (call on sign-out / account switch). */
export function clearBlockCache(): void {
  cache = null;
}

/** Ids of users the signed-in user has blocked (empty for guests). */
export async function getBlockedUserIds(): Promise<Set<string>> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user?.id;
  if (!userId) {
    cache = null;
    return new Set();
  }
  if (cache && cache.userId === userId) return cache.ids;

  const { data, error } = await supabase
    .from('user_blocks')
    .select('blocked_id')
    .eq('blocker_id', userId);
  if (error) return new Set(); // don't cache a failure — retry next time
  const ids = new Set((data ?? []).map((r) => r.blocked_id));
  cache = { userId, ids };
  return ids;
}

export async function blockUser(blockedId: string): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user?.id;
  if (!userId) throw new Error('로그인이 필요해요');
  const { error } = await supabase
    .from('user_blocks')
    .insert({ blocker_id: userId, blocked_id: blockedId });
  // already blocked → fine
  if (error && !/duplicate key/i.test(error.message)) throw new Error(error.message);
  if (cache?.userId === userId) cache.ids.add(blockedId);
}

export async function unblockUser(blockedId: string): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user?.id;
  if (!userId) throw new Error('로그인이 필요해요');
  const { error } = await supabase
    .from('user_blocks')
    .delete()
    .eq('blocker_id', userId)
    .eq('blocked_id', blockedId);
  if (error) throw new Error(error.message);
  if (cache?.userId === userId) cache.ids.delete(blockedId);
}

export interface BlockedUser {
  id: string;
  nickname: string;
}

/** Block list with display names, for the account screen's 차단 관리. */
export async function getBlockedUsers(): Promise<BlockedUser[]> {
  const ids = [...(await getBlockedUserIds())];
  if (ids.length === 0) return [];
  const nicks = await getNicknames(ids);
  return ids.map((id) => ({ id, nickname: nicks.get(id) ?? '방문자' }));
}
