/**
 * Globe tab — the entry globe (d3-geo orthographic). Tap a highlighted country
 * to jump to its fill map (wired in a later step).
 */
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Palette, Space } from '@/constants/footprint-theme';
import { CountryGlobe } from '@/features/globe/CountryGlobe';

export default function GlobeScreen() {
  const router = useRouter();
  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.dot} />
            <Text style={styles.brand}>footprint</Text>
          </View>
        </View>
        <View style={styles.globeWrap}>
          <CountryGlobe
            onSelectCountry={(country) => router.push(`/explore?country=${country}`)}
          />
        </View>
        <Text style={styles.hint}>지구를 돌려 금색 나라를 눌러보세요 · 한국 · 일본 · 태국</Text>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  safe: { flex: 1, padding: Space.lg },
  header: { marginTop: Space.sm },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: Palette.gold },
  brand: { color: Palette.ink, fontSize: 22, fontWeight: '700', letterSpacing: -0.5 },
  globeWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hint: { color: Palette.muted, fontSize: 14, textAlign: 'center', marginBottom: Space.md },
});
