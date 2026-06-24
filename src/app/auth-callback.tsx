/**
 * OAuth redirect target (footprint://auth-callback). The actual code→session
 * exchange is done by the root-layout deep-link listener (see _layout.tsx),
 * which reliably receives the redirect. This screen just shows a spinner and
 * forwards the user to their 내 발자국 tab once the session settles — with a
 * safety timeout so it can never hang.
 */
import * as Linking from 'expo-linking';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Palette } from '@/constants/footprint-theme';
import { completeOAuthFromUrl } from '@/lib/auth';

export default function AuthCallback() {
  const router = useRouter();
  const incomingUrl = Linking.useURL();
  const params = useLocalSearchParams<{ code?: string }>();
  const done = useRef(false);

  useEffect(() => {
    const leave = () => {
      if (done.current) return;
      done.current = true;
      router.replace('/me');
    };

    // Best-effort: if this screen happens to have the URL/code, finish here too
    // (idempotent — the root listener may have already done it).
    const url =
      incomingUrl && incomingUrl.includes('auth-callback')
        ? incomingUrl
        : params.code
          ? `footprint://auth-callback?code=${params.code}`
          : null;
    if (url) {
      completeOAuthFromUrl(url)
        .catch(() => {})
        .finally(leave);
    }

    // Safety net: never strand the user on the spinner.
    const t = setTimeout(leave, 4000);
    return () => clearTimeout(t);
  }, [incomingUrl, params.code, router]);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <ActivityIndicator color={Palette.gold} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg, alignItems: 'center', justifyContent: 'center' },
});
