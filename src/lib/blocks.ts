/**
 * User blocking (Play/App Store UGC requirement: report AND block).
 * A block hides the blocked author's 여행 공유 from MY feed only — nothing is
 * deleted and the other user isn't notified. Rows live in user_blocks (RLS:
 * own rows only), so the list survives reinstalls and follows the account.
 */
import { getNicknames } from '@/lib/profile';
import { supabase } from '@/lib/supabase';

/** Ids of users the signed-in user has blocked (empty for guests). */
export async function getBlockedUserIds(): Promise<Set<string>> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user?.id;
  if (!userId) return new Set();
  const { data } = await supabase
    .from('user_blocks')
    .select('blocked_id')
    .eq('blocker_id', userId);
  return new Set((data ?? []).map((r) => r.blocked_id));
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
