/**
 * Country fill map screen (Map tab). Shows an admin-1 choropleth filled from
 * the local-first visits projection — reflects check-ins instantly, offline,
 * before any backend sync. A country selector switches between bundled
 * countries (KR / JP in v1).
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Palette, Space } from '@/constants/footprint-theme';
import { availableCountries, loadRegions } from '@/data';
import { CountryFillMap } from '@/features/map/CountryFillMap';
import { getLocalVisitsByRegion } from '@/lib/localVisits';
import { COUNTRIES, type CountryCode, type Visit } from '@/types/domain';

export default function MapScreen() {
  const countries = useMemo(() => availableCountries(), []);
  const [country, setCountry] = useState<CountryCode>(countries[0] ?? 'JP');
  const regions = useMemo(() => loadRegions(country), [country]);
  const [visits, setVisits] = useState<Record<string, Visit>>({});

  // Reload the local fill state whenever the tab regains focus or the country
  // changes, so a check-in made on the other tab shows up immediately.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      getLocalVisitsByRegion(country).then((v) => {
        if (active) setVisits(v);
      });
      return () => {
        active = false;
      };
    }, [country]),
  );

  const filled = Object.keys(visits).length;
  const unit = country === 'JP' ? '현' : country === 'TH' ? '주' : '시·도';

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title}>{COUNTRIES[country].nameLocal}</Text>
          <View style={styles.stat}>
            <Text style={styles.statNum}>
              {filled} / {regions.length}
            </Text>
            <Text style={styles.statLabel}>채운 {unit}</Text>
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
          <CountryFillMap regions={regions} visits={visits} />
        </View>

        <View style={styles.legend}>
          <Legend color={Palette.gold} label="채움" />
          <Legend color={Palette.slate} label="미방문" outline />
          {filled === 0 && <Text style={styles.emptyHint}>체크인하면 지역이 채워집니다.</Text>}
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
  stat: { alignItems: 'flex-end' },
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
  mapWrap: { flex: 1, marginVertical: Space.lg },
  legend: { flexDirection: 'row', alignItems: 'center', gap: Space.lg, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: Space.xs },
  legendDot: { width: 12, height: 12, borderRadius: 3 },
  legendText: { color: Palette.muted, fontSize: 13 },
  emptyHint: { color: Palette.muted, fontSize: 13 },
});
