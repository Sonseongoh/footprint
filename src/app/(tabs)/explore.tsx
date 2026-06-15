/**
 * Country fill map screen (Map tab). Shows an admin-1 choropleth filled from
 * the local-first visits projection — reflects check-ins instantly, offline,
 * before any backend sync. A country selector switches between bundled
 * countries (KR / JP in v1).
 */
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Palette, Space } from '@/constants/footprint-theme';
import { availableCountries, loadCities, loadRegions } from '@/data';
import { CountryFillMap } from '@/features/map/CountryFillMap';
import { getLocalVisitsByRegion, getVisitedCityIds } from '@/lib/localVisits';
import { ensureUserShare, userShareUrlFor } from '@/lib/share';
import { COUNTRIES, type CountryCode, type Visit } from '@/types/domain';

export default function MapScreen() {
  const countries = useMemo(() => availableCountries(), []);
  const [country, setCountry] = useState<CountryCode>(countries[0] ?? 'JP');

  // globe tap → /explore?country=XX
  const params = useLocalSearchParams<{ country?: string }>();
  useEffect(() => {
    const c = params.country as CountryCode | undefined;
    if (c && countries.includes(c)) setCountry(c);
  }, [params.country, countries]);
  const regions = useMemo(() => loadRegions(country), [country]);
  const cities = useMemo(() => loadCities(country), [country]);
  const [visits, setVisits] = useState<Record<string, Visit>>({});
  const [visitedCities, setVisitedCities] = useState<Set<string>>(new Set());

  // Reload the local fill state whenever the tab regains focus or the country
  // changes, so a check-in made on the other tab shows up immediately.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      getLocalVisitsByRegion(country).then((v) => active && setVisits(v));
      getVisitedCityIds(country).then((s) => active && setVisitedCities(s));
      return () => {
        active = false;
      };
    }, [country]),
  );

  // city collection is the headline metric (도시 단위 깊이)
  const filledCities = cities.filter((c) => visitedCities.has(c.id)).length;

  async function handleShare() {
    try {
      // one link per user → page shows all visited countries as tabs
      const slug = await ensureUserShare();
      const url = userShareUrlFor(slug);
      await Share.share({ message: `내 발자국 지도 🗺✨ ${url}` });
    } catch (e) {
      Alert.alert('공유 실패', e instanceof Error ? e.message : '잠시 후 다시 시도해주세요');
    }
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title}>{COUNTRIES[country].nameLocal}</Text>
          <View style={styles.headerRight}>
            <View style={styles.stat}>
              <Text style={styles.statNum}>
                {filledCities} / {cities.length}
              </Text>
              <Text style={styles.statLabel}>채운 도시</Text>
            </View>
            <Pressable style={styles.shareBtn} onPress={handleShare}>
              <Text style={styles.shareBtnText}>공유</Text>
            </Pressable>
          </View>
        </View>

        {countries.length > 1 && (
          <View style={styles.tabs}>
            {countries.map((c) => (
              <Pressable
                key={c}
                onPress={() => setCountry(c)}
                style={[styles.tab, c === country && styles.tabActive]}>
                <Text style={[styles.tabText, c === country && styles.tabTextActive]}>
                  {COUNTRIES[c].nameLocal}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        <View style={styles.mapWrap}>
          <CountryFillMap
            regions={regions}
            cities={cities}
            visits={visits}
            visitedCityIds={visitedCities}
          />
        </View>

        <View style={styles.legend}>
          <Legend color={Palette.gold} label="방문 도시" />
          <Legend color={Palette.slate} label="더 채울 곳" outline />
          {filledCities === 0 && (
            <Text style={styles.emptyHint}>체크인하면 도시가 채워집니다.</Text>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

function Legend({ color, label, outline }: { color: string; label: string; outline?: boolean }) {
  return (
    <View style={styles.legendItem}>
      <View
        style={[
          styles.legendDot,
          { backgroundColor: color },
          outline ? { borderWidth: 1, borderColor: Palette.surfaceLine } : null,
        ]}
      />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  safe: { flex: 1, padding: Space.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { color: Palette.ink, fontSize: 24, fontWeight: '800' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  stat: { alignItems: 'flex-end' },
  shareBtn: {
    backgroundColor: Palette.gold,
    borderRadius: 12,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  shareBtnText: { color: Palette.bg, fontSize: 14, fontWeight: '700' },
  statNum: { color: Palette.gold, fontSize: 20, fontWeight: '800' },
  statLabel: { color: Palette.muted, fontSize: 13 },
  tabs: { flexDirection: 'row', gap: Space.sm, marginTop: Space.md },
  tab: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
    borderRadius: 999,
    backgroundColor: Palette.surface,
  },
  tabActive: { backgroundColor: Palette.gold },
  tabText: { color: Palette.muted, fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: Palette.bg },
  // clip the zoomed/panned map to its own area so it never covers the tabs/legend
  mapWrap: { flex: 1, marginVertical: Space.lg, overflow: 'hidden', borderRadius: 16 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: Space.lg, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: Space.xs },
  legendDot: { width: 12, height: 12, borderRadius: 3 },
  legendText: { color: Palette.muted, fontSize: 13 },
  emptyHint: { color: Palette.muted, fontSize: 13 },
});
