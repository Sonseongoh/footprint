/**
 * Supabase client for React Native (Expo SDK 56).
 *
 * Verified against the Supabase React Native quickstart (2026-06-02):
 *  - session is persisted through a custom storage adapter, NOT raw AsyncStorage,
 *    because expo-secure-store has a 2048-byte limit and Supabase sessions are
 *    larger. LargeSecureStore keeps a random AES key in SecureStore and the
 *    ciphertext in AsyncStorage.
 *  - auth options: autoRefreshToken, persistSession, detectSessionInUrl:false
 *    (no URL-based sessions on native).
 *
 * Deferred auth: the app calls ensureAnonymousSession() on launch so a user can
 * record immediately with zero friction; later they upgrade in place via
 * updateUser({ email }) or linkIdentity({ provider }) without losing data.
 */
import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import * as aesjs from 'aes-js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loud in dev so a missing .env doesn't surface as a confusing auth error.
  console.warn(
    '[supabase] EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are not set. ' +
      'Copy .env.example to .env and fill in your project values.',
  );
}

/**
 * Encrypts session values with a per-key AES-CTR key held in SecureStore; the
 * ciphertext lives in AsyncStorage (which has no size limit). This is the
 * Supabase-recommended adapter for RN.
 */
class LargeSecureStore implements SupportedStorage {
  private async encrypt(key: string, value: string): Promise<string> {
    const encryptionKey = Crypto.getRandomBytes(256 / 8);
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
    const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));
    return aesjs.utils.hex.fromBytes(encryptedBytes);
  }

  private async decrypt(key: string, value: string): Promise<string | null> {
    const encryptionKeyHex = await SecureStore.getItemAsync(key);
    if (!encryptionKeyHex) return null;
    const cipher = new aesjs.ModeOfOperation.ctr(
      aesjs.utils.hex.toBytes(encryptionKeyHex),
      new aesjs.Counter(1),
    );
    const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(value));
    return aesjs.utils.utf8.fromBytes(decryptedBytes);
  }

  async getItem(key: string): Promise<string | null> {
    const encrypted = await AsyncStorage.getItem(key);
    if (!encrypted) return null;
    return this.decrypt(key, encrypted);
  }

  async setItem(key: string, value: string): Promise<void> {
    const encrypted = await this.encrypt(key, value);
    await AsyncStorage.setItem(key, encrypted);
  }

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key);
  }
}

// supabase-js throws "supabaseUrl is required" on an empty URL, which would
// crash the app at import time before the backend is configured. Fall back to a
// syntactically-valid placeholder so the app still loads in local-only mode;
// real network calls then fail and are caught (backendReady = false).
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      storage: new LargeSecureStore(),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

/**
 * Ensures there is a session, creating an anonymous user on first launch.
 * Returns the user id. Call once on app start (deferred-auth entry point).
 */
export async function ensureAnonymousSession(): Promise<string> {
  const { data: existing } = await supabase.auth.getSession();
  if (existing.session?.user) return existing.session.user.id;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  if (!data.user) throw new Error('signInAnonymously returned no user');
  return data.user.id;
}
