/**
 * Globe tab — the entry globe (d3-geo orthographic). Tap a gold country to open
 * its fill map. First run (no check-ins yet) shows an onboarding hint card.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Palette, Space } from '@/constants/footprint-theme';
import { CountryGlobe } from '@/features/globe/CountryGlobe';
import { getVisitedCountries, hasAnyVisit } from '@/lib/localVisits';
import type { CountryCode } from '@/types/domain';

export default function GlobeScreen() {
  const router = useRouter();
  const [firstRun, setFirstRun] = useState(false);
  const [visited, setVisited] = useState<Set<CountryCode>>(new Set());

  useFocusEffect(
    useCallback(() => {
      let active = true;
      hasAnyVisit()
        .then((has) => active && setFirstRun(!has))
        .catch(() => {});
      getVisitedCountries()
        .then((v) => active && setVisited(v))
        .catch(() => {});
      return () => {
        active = false;
      };
    }, []),
  );

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
            visitedCountries={visited}
            onSelectCountry={(country) => router.push(`/explore?country=${country}`)}
          />
        </View>

        {firstRun ? (
          <Pressable style={styles.onboardCard} onPress={() => router.push('/(tabs)')}>
            <Text style={styles.onboardTitle}>첫 발자국을 남겨보세요 ✦</Text>
            <Text style={styles.onboardBody}>
              여행지에서 <Text style={styles.onboardEm}>지금 여기 체크인</Text>을 누르면{'\n'}
              지구의 그 자리가 금색으로 채워집니다.
            </Text>
            <Text style={styles.onboardCta}>체크인 하러 가기 →</Text>
          </Pressable>
        ) : (
          <Text style={styles.hint}>지구를 돌려 금색 나라를 눌러보세요 · 한국 · 일본 · 태국</Text>
        )}
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
  onboardCard: {
    backgroundColor: Palette.bgElevated,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(245,194,107,0.35)',
    padding: Space.lg,
    gap: Space.sm,
    marginBottom: Space.md,
  },
  onboardTitle: { color: Palette.gold, fontSize: 16, fontWeight: '700' },
  onboardBody: { color: Palette.ink, fontSize: 14, lineHeight: 21 },
  onboardEm: { color: Palette.gold, fontWeight: '700' },
  onboardCta: { color: Palette.muted, fontSize: 13, marginTop: 2 },
});
