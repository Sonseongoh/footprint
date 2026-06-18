/**
 * Email/password auth on top of the deferred-anonymous flow.
 *
 *  - The app always starts anonymous (ensureAnonymousSession) so a user can
 *    check in with zero friction.
 *  - Signing UP while anonymous *links* the email to that same user
 *    (updateUser) — their existing map/notes carry over, no data loss.
 *  - Signing IN switches to an existing account; signing OUT drops back to a
 *    fresh anonymous guest so the app always has a working session.
 *
 * Switching the signed-in user changes who owns server data (notes,
 * write-eligibility, visits). The on-device fill projection is per-device, so we
 * wipe it on every switch (clearLocalVisits) to keep accounts visually separate.
 */
import { clearLocalVisits } from '@/lib/localVisits';
import { ensureAnonymousSession, supabase } from '@/lib/supabase';

export interface AuthState {
  /** email when signed into a real account, null while an anonymous guest */
  email: string | null;
  isAnonymous: boolean;
}

export async function getAuthState(): Promise<AuthState> {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  return {
    email: user?.email ?? null,
    // supabase marks deferred sign-ins; treat "no email" as guest too
    isAnonymous: user?.is_anonymous ?? !user?.email,
  };
}

function friendlyAuthError(message: string): Error {
  if (/already registered|already been registered/i.test(message)) {
    return new Error('이미 가입된 이메일이에요. 로그인해 주세요.');
  }
  if (/invalid login credentials/i.test(message)) {
    return new Error('이메일 또는 비밀번호가 올바르지 않아요.');
  }
  if (/password/i.test(message) && /6/.test(message)) {
    return new Error('비밀번호는 6자 이상이어야 해요.');
  }
  return new Error(message);
}

/**
 * Create an account. While anonymous, links the email to the current guest user
 * so their data is preserved. Returns whether email confirmation is pending
 * (true when Supabase "Confirm email" is on — the account isn't usable until the
 * link in the email is clicked).
 */
export async function signUpWithEmail(
  email: string,
  password: string,
): Promise<{ needsConfirm: boolean }> {
  const { data: cur } = await supabase.auth.getUser();
  if (cur.user && !cur.user.is_anonymous && cur.user.email) {
    throw new Error('이미 로그인되어 있어요. 먼저 로그아웃해 주세요.');
  }

  if (cur.user?.is_anonymous) {
    // convert the anonymous guest into a permanent email account (keeps data)
    const { data, error } = await supabase.auth.updateUser({ email, password });
    if (error) throw friendlyAuthError(error.message);
    return { needsConfirm: !data.user?.email_confirmed_at };
  }

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw friendlyAuthError(error.message);
  return { needsConfirm: !data.session };
}

/** Sign into an existing account, replacing the current session. */
export async function signInWithEmail(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw friendlyAuthError(error.message);
  await clearLocalVisits(); // new account → fresh local map
}

/** Sign out and return to a fresh anonymous guest (app always has a session). */
export async function signOutToGuest(): Promise<void> {
  await supabase.auth.signOut();
  await clearLocalVisits();
  await ensureAnonymousSession();
}
