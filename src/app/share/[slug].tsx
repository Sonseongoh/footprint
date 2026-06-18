/**
 * Public share page — /share/[slug]. Anyone with the link (no app, no login)
 * sees the owner's country fill map: regions visited + counts ONLY (RLS keeps
 * notes/GPS/photos private). Renders on web via react-native-web; the same
 * route also works in-app.
 */
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Palette, Space } from '@/constants/footprint-theme';
import { loadBackground, loadCities, loadFillUnits } from '@/data';
import { CountryFillMap } from '@/features/map/CountryFillMap';
import { getPublicShare, type PublicShareData } from '@/lib/share';
import { COUNTRIES, type Visit } from '@/types/domain';

export default function PublicShareScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [data, setData] = useState<PublicShareData | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'notfound'>('loading');

  useEffect(() => {
    let active = true;
    if (!slug) return;
    getPublicShare(String(slug))
      .then((d) => {
        if (!active) return;
        setData(d);
        setState(d ? 'ok' : 'notfound');
      })
      .catch(() => active && setState('notfound'));
    return () => {
      active = false;
    };
  }, [slug]);

  // KR fills by 시 (city areas) over a 도 backdrop; JP/TH fill by admin-1 + city points
  const regions = useMemo(() => (data ? loadFillUnits(data.country) : []), [data]);
  const background = useMemo(() => (data ? loadBackground(data.country) : []), [data]);
  const cities = useMemo(
    () => (data && data.country !== 'KR' ? loadCities(data.country) : []),
    [data],
  );

  // adapt the public counts to the map's visits shape (fill only — no city depth)
  const visits = useMemo(() => {
    const out: Record<string, Visit> = {};
    if (!data) return out;
    for (const [regionId, count] of Object.entries(data.regions)) {
      out[regionId] = {
        id: regionId,
        userId: 'public',
        regionId,
        country: data.country,
        firstVisitedAt: '',
        lastVisitedAt: '',
        visitCount: count,
      };
    }
    return out;
  }, [data]);

  if (state === 'loading') {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={Palette.gold} />
      </View>
    );
  }

  if (state === 'notfound' || !data) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.title}>페이지를 찾을 수 없어요</Text>
        <Text style={styles.muted}>링크가 잘못됐거나 공개가 해제됐습니다.</Text>
      </View>
    );
  }

  // KR counts collected 시 (fill units); JP/TH count city points
  const filledCities =
    data.country === 'KR'
      ? regions.filter((r) => visits[r.properties.id]).length
      : cities.filter((c) => data.visitedCityIds.has(c.id)).length;
  const totalCities = data.country === 'KR' ? regions.length : cities.length;

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.brandRow}>
          <View style={styles.dot} />
          <Text style={styles.brand}>footprint</Text>
        </View>

        <Text style={styles.heading}>{COUNTRIES[data.country].nameLocal} 발자국 지도</Text>
        <Text style={styles.sub}>
          채운 도시 {filledCities} / {totalCities} · 총 체크인 {data.totalVisits}회
        </Text>

        <View style={styles.mapWrap}>
          <CountryFillMap
            regions={regions}
            cities={cities}
            visits={visits}
            visitedCityIds={data.visitedCityIds}
            background={background}
          />
        </View>

        <Text style={styles.footer}>나도 내 지도를 채우고 싶다면 — footprint</Text>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  safe: { flex: 1, padding: Space.lg, maxWidth: 560, width: '100%', alignSelf: 'center' },
  center: { alignItems: 'center', justifyContent: 'center', gap: Space.sm },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, marginTop: Space.sm },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: Palette.gold },
  brand: { color: Palette.ink, fontSize: 18, fontWeight: '700', letterSpacing: -0.5 },
  heading: { color: Palette.ink, fontSize: 26, fontWeight: '800', marginTop: Space.lg },
  sub: { color: Palette.gold, fontSize: 15, fontWeight: '600', marginTop: 4 },
  mapWrap: { flex: 1, marginVertical: Space.lg, overflow: 'hidden', borderRadius: 16 },
  title: { color: Palette.ink, fontSize: 20, fontWeight: '700' },
  muted: { color: Palette.muted, fontSize: 14 },
  footer: { color: Palette.muted, fontSize: 13, textAlign: 'center', marginBottom: Space.md },
});
