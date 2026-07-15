/**
 * Country fill map screen (Map tab). Shows an admin-1 choropleth filled from
 * the local-first visits projection — reflects check-ins instantly, offline,
 * before any backend sync. A country selector switches between bundled
 * countries (KR / JP in v1).
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Palette, Space } from '@/constants/footprint-theme';
import { availableCountries, loadBackground, loadFillUnits } from '@/data';
import { CountryFillMap } from '@/features/map/CountryFillMap';
import { getLocalVisitsByRegion } from '@/lib/localVisits';
import { ensureUserShare, userShareUrlFor } from '@/lib/share';
import { COUNTRIES, type CountryCode, type Visit } from '@/types/domain';

export default function MapScreen() {
  const router = useRouter();
  const countries = useMemo(() => availableCountries(), []);
  const [country, setCountry] = useState<CountryCode>(countries[0] ?? 'JP');

  // globe tap → /explore?country=XX&t=nonce. The nonce matters: without it,
  // re-tapping the SAME country on the globe after switching countries here
  // leaves params.country unchanged, the effect never re-fires, and the map
  // stays on the wrong country.
  const params = useLocalSearchParams<{ country?: string; t?: string }>();
  useEffect(() => {
    const c = params.country as CountryCode | undefined;
    if (c && countries.includes(c)) setCountry(c);
  }, [params.country, params.t, countries]);
  // fill units = city areas (all countries), over an admin-1 backdrop
  const regions = useMemo(() => loadFillUnits(country), [country]);
  const background = useMemo(() => loadBackground(country), [country]);
  const [visits, setVisits] = useState<Record<string, Visit>>({});

  // Reload the local fill state whenever the tab regains focus or the country
  // changes, so a check-in made on the other tab shows up immediately.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      getLocalVisitsByRegion(country).then((v) => active && setVisits(v));
      return () => {
        active = false;
      };
    }, [country]),
  );

  // headline metric = collected cities (the fill units ARE the cities)
  const filledCount = regions.filter((r) => visits[r.properties.id]).length;
  const totalCount = regions.length;

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
                {filledCount} / {totalCount}
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
            visits={visits}
            background={background}
            onSelectRegion={(regionId) =>
              router.push({ pathname: '/city/[regionId]', params: { regionId, country } })
            }
          />
        </View>

        {filledCount === 0 && (
          <Text style={styles.emptyHint}>체크인하면 도시가 채워집니다.</Text>
        )}
        <View style={styles.legend}>
          <Legend color={Palette.gold} label="방문" />
          <Legend color={Palette.slate} label="미방문" outline />
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
  emptyHint: { color: Palette.muted, fontSize: 13, textAlign: 'center', marginBottom: Space.sm },
});
