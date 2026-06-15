import '../global.css';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay } from '@/components/animated-icon';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  // Root is a Stack: the tab app lives in (tabs); /share/[slug] renders OUTSIDE
  // the tab navigator so the public web link shows only the share page.
  // GestureHandlerRootView must wrap the app root (globe/map gestures).
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="u/[slug]" />
          <Stack.Screen name="share/[slug]" />
        </Stack>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
