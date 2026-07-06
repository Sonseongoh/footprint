import '../global.css';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as Linking from 'expo-linking';
import { useEffect } from 'react';
import { Alert } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { completeOAuthFromUrl } from '@/lib/auth';

/**
 * Finish OAuth redirects (footprint://auth-callback?code=…) from the app root.
 * The root layout is mounted before any sign-in deep link arrives, so this
 * listener reliably catches the redirect even when expo-router consumes the URL
 * before the /auth-callback screen can read it.
 *
 * This is the ONE place that reports the outcome — on Android the whole flow is
 * otherwise silent (the account screen never sees a result), so a failure here
 * must not be swallowed. The /auth-callback screen's own attempt stays quiet:
 * it is just a backup and would double-alert.
 */
function useOAuthDeepLink() {
  useEffect(() => {
    const handle = (url: string | null) => {
      if (!url || !url.includes('auth-callback')) return;
      completeOAuthFromUrl(url)
        .then(() => Alert.alert('로그인 완료', '계정으로 로그인했어요.'))
        .catch((e) =>
          Alert.alert(
            '로그인 실패',
            e instanceof Error ? e.message : '로그인을 완료하지 못했어요. 다시 시도해주세요.',
          ),
        );
    };
    Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, []);
}

export default function RootLayout() {
  useOAuthDeepLink();
  // Root is a Stack: the tab app lives in (tabs); /share/[slug] renders OUTSIDE
  // the tab navigator so the public web link shows only the share page.
  // GestureHandlerRootView must wrap the app root (globe/map gestures).
  // Dark theme is FIXED — every screen hardcodes the navy palette, so following
  // the system scheme only produced white flashes/bars on light-mode devices.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={DarkTheme}>
        <AnimatedSplashOverlay />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="account" />
          <Stack.Screen name="auth-callback" />
          <Stack.Screen name="blocked" />
          <Stack.Screen name="privacy" />
          <Stack.Screen name="city/[regionId]" />
          <Stack.Screen name="u/[slug]" />
          <Stack.Screen name="share/[slug]" />
        </Stack>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
