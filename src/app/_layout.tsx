import '../global.css';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as Linking from 'expo-linking';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { completeOAuthFromUrl } from '@/lib/auth';

/**
 * Finish OAuth redirects (footprint://auth-callback?code=…) from the app root.
 * The root layout is mounted before any sign-in deep link arrives, so this
 * listener reliably catches the redirect even when expo-router consumes the URL
 * before the /auth-callback screen can read it.
 */
function useOAuthDeepLink() {
  useEffect(() => {
    const handle = (url: string | null) => {
      if (url && url.includes('auth-callback')) completeOAuthFromUrl(url).catch(() => {});
    };
    Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, []);
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  useOAuthDeepLink();
  // Root is a Stack: the tab app lives in (tabs); /share/[slug] renders OUTSIDE
  // the tab navigator so the public web link shows only the share page.
  // GestureHandlerRootView must wrap the app root (globe/map gestures).
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="account" />
          <Stack.Screen name="auth-callback" />
          <Stack.Screen name="privacy" />
          <Stack.Screen name="city/[regionId]" />
          <Stack.Screen name="u/[slug]" />
          <Stack.Screen name="share/[slug]" />
        </Stack>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
