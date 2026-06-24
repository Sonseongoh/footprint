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
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { clearLocalVisits, hydrateLocalFromServer } from '@/lib/localVisits';
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
  if (/identity is already linked|already linked to another/i.test(message)) {
    return new Error('이 구글 계정은 다른 계정에 이미 연결돼 있어요. 그 계정으로 로그인해 주세요.');
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
  // new account → rebuild the local fill map from that account's server visits
  await clearLocalVisits();
  await hydrateLocalFromServer();
}

/** Sign out and return to a fresh anonymous guest (app always has a session). */
export async function signOutToGuest(): Promise<void> {
  await supabase.auth.signOut();
  await clearLocalVisits();
  await ensureAnonymousSession();
}

/** Deep link Supabase sends the OAuth result back to (footprint://auth-callback). */
const oauthRedirect = Linking.createURL('auth-callback');

/**
 * Finish an OAuth redirect: exchange the auth code (or implicit-flow tokens) for
 * a session. If the signed-in user actually changed (account switch, not an
 * anon→provider link) the per-device local map is reset. Idempotent — a code
 * that was already consumed is treated as success, so it's safe to call from
 * both the in-app session result (iOS) and the /auth-callback route (Android).
 */
export async function completeOAuthFromUrl(url: string): Promise<void> {
  const before = (await supabase.auth.getUser()).data.user?.id ?? null;
  const resetIfSwitched = async () => {
    const after = (await supabase.auth.getUser()).data.user?.id ?? null;
    if (before && after && before !== after) {
      // switched into another account → rebuild its fill map from the server
      await clearLocalVisits();
      await hydrateLocalFromServer();
    }
  };

  const { queryParams } = Linking.parse(url);
  const code = typeof queryParams?.code === 'string' ? queryParams.code : null;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    // a re-used/expired code means another handler already finished it — not a failure
    if (error && !/code|verifier|expired|invalid request|already/i.test(error.message)) {
      throw friendlyAuthError(error.message);
    }
    await resetIfSwitched();
    return;
  }

  // implicit-flow fallback: tokens arrive in the URL fragment
  const fragment = url.includes('#') ? url.slice(url.indexOf('#') + 1) : '';
  const params = new URLSearchParams(fragment);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error && !/already/i.test(error.message)) throw friendlyAuthError(error.message);
    await resetIfSwitched();
    return;
  }

  const desc =
    (typeof queryParams?.error_description === 'string' && queryParams.error_description) ||
    params.get('error_description');
  throw new Error(desc || '구글 로그인을 완료하지 못했어요.');
}

/**
 * Sign in with Google via an in-app browser. Always a plain OAuth sign-in: if
 * the Google account already has a footprint account we switch into it, and a
 * brand-new Google account creates one. (We deliberately do NOT try to *link*
 * Google to the current anonymous guest — linking fails at the OAuth callback
 * whenever that Google account already exists, which surfaces as a confusing
 * "identity is already linked" error. Guests who want to keep their on-device
 * map should sign up with email, which preserves data via updateUser.)
 * completeOAuthFromUrl resets the local map when the user actually changes.
 *
 * Requires Google enabled in Supabase Auth → Providers, and footprint://
 * registered as an allowed redirect URL.
 */
export async function signInWithGoogle(): Promise<{ canceled: boolean }> {
  const opts = { redirectTo: oauthRedirect, skipBrowserRedirect: true } as const;
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: opts });
  if (error) throw friendlyAuthError(error.message);
  const url = data?.url;
  if (!url) throw new Error('구글 로그인 URL을 받지 못했어요.');

  const result = await WebBrowser.openAuthSessionAsync(url, oauthRedirect);
  // iOS (and any platform where the in-app session intercepts the redirect):
  // finish here. On Android the redirect deep-links into the app and the
  // /auth-callback route finishes it instead, so a non-success result here is
  // not an error — just report "canceled" and let the route take over.
  if (result.type === 'success' && 'url' in result && result.url) {
    await completeOAuthFromUrl(result.url);
    return { canceled: false };
  }
  return { canceled: true };
}

/** Recursively delete every object under `prefix` in a storage bucket (best-effort). */
async function removeStorageFolder(bucket: string, prefix: string): Promise<void> {
  const { data: entries } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
  if (!entries || entries.length === 0) return;
  const files: string[] = [];
  for (const e of entries) {
    const path = `${prefix}/${e.name}`;
    // Supabase lists sub-folders as entries with a null id; recurse into them.
    if (e.id === null) await removeStorageFolder(bucket, path);
    else files.push(path);
  }
  if (files.length) await supabase.storage.from(bucket).remove(files);
}

/**
 * Permanently delete the signed-in account and all its data. Removes the user's
 * storage objects first (while still authorized as them), then calls the
 * delete_account RPC which deletes the auth user — cascading to every public
 * row they own. Finally drops back to a fresh anonymous guest.
 */
export async function deleteAccount(): Promise<void> {
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (userId) {
    // best-effort photo cleanup — failure here must not block account deletion
    try {
      await removeStorageFolder('photos', userId);
      await removeStorageFolder('note-photos', userId);
    } catch {
      // ignore: the DB rows (the personal data that matters) are still removed below
    }
  }

  const { error } = await supabase.rpc('delete_account');
  if (error) throw new Error(error.message);

  await supabase.auth.signOut();
  await clearLocalVisits();
  await ensureAnonymousSession();
}
