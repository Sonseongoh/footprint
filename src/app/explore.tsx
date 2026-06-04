/**
 * Country fill map screen (Map tab). Shows the Japan admin-1 choropleth filled
 * from the local-first visits projection — so it reflects check-ins instantly,
 * offline, before any backend sync.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Palette, Space } from '@/constants/footprint-theme';
import { loadRegions } from '@/data';
import { CountryFillMap } from '@/features/map/CountryFillMap';
import { getLocalVisitsByRegion } from '@/lib/localVisits';
import type { Visit } from '@/types/domain';

export default function MapScreen() {
  const regions = useMemo(() => loadRegions('JP'), []);
  const [visits, setVisits] = useState<Record<string, Visit>>({});

  // Reload the local fill state every time the tab regains focus, so a check-in
  // made on the other tab shows up immediately.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      getLocalVisitsByRegion('JP').then((v) => {
        if (active) setVisits(v);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  const filled = Object.keys(visits).length;

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title}>일본</Text>
          <View style={styles.stat}>
            <Text style={styles.statNum}>
              {filled} / {regions.length}
            </Text>
            <Text style={styles.statLabel}>채운 현</Text>
          </View>
        </View>

        <View style={styles.mapWrap}>
          <CountryFillMap regions={regions} visits={visits} />
        </View>

        <View style={styles.legend}>
          <Legend color={Palette.gold} label="채움" />
          <Legend color={Palette.slate} label="미방문" outline />
          {filled === 0 && <Text style={styles.emptyHint}>체크인하면 현이 채워집니다.</Text>}
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
  mapWrap: { flex: 1, marginVertical: Space.lg },
  legend: { flexDirection: 'row', alignItems: 'center', gap: Space.lg, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: Space.xs },
  legendDot: { width: 12, height: 12, borderRadius: 3 },
  legendText: { color: Palette.muted, fontSize: 13 },
  emptyHint: { color: Palette.muted, fontSize: 13 },
});
