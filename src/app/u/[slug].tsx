/**
 * Public user share page — /u/[slug]. One link per user; shows every country
 * they've checked into as tabs (visited countries only). Region + city fill is
 * read via public RLS; notes/GPS/photos stay private.
 */
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Palette, Space } from '@/constants/footprint-theme';
import { loadBackground, loadCities, loadFillUnits } from '@/data';
import { CountryFillMap } from '@/features/map/CountryFillMap';
import { getPublicUserShare, type UserShareData } from '@/lib/share';
import { COUNTRIES, type CountryCode, type Visit } from '@/types/domain';

export default function PublicUserShareScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [data, setData] = useState<UserShareData | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'notfound'>('loading');
  const [country, setCountry] = useState<CountryCode | null>(null);

  useEffect(() => {
    let active = true;
    if (!slug) return;
    getPublicUserShare(String(slug))
      .then((d) => {
        if (!active) return;
        if (!d || d.countries.length === 0) {
          setState('notfound');
          return;
        }
        setData(d);
        setCountry(d.countries[0]);
        setState('ok');
      })
      .catch(() => active && setState('notfound'));
    return () => {
      active = false;
    };
  }, [slug]);

  // KR fills by 시 (city areas) over a 도 backdrop; JP/TH fill by admin-1 + city points
  const regions = useMemo(() => (country ? loadFillUnits(country) : []), [country]);
  const background = useMemo(() => (country ? loadBackground(country) : []), [country]);
  const cities = useMemo(
    () => (country && country !== 'KR' ? loadCities(country) : []),
    [country],
  );

  const share = country && data ? data.byCountry[country] : undefined;

  const visits = useMemo(() => {
    const out: Record<string, Visit> = {};
    if (!share || !country) return out;
    for (const [regionId, count] of Object.entries(share.regions)) {
      out[regionId] = {
        id: regionId,
        userId: 'public',
        regionId,
        country,
        firstVisitedAt: '',
        lastVisitedAt: '',
        visitCount: count,
      };
    }
    return out;
  }, [share, country]);

  if (state === 'loading') {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={Palette.gold} />
      </View>
    );
  }

  if (state === 'notfound' || !data || !country) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.title}>페이지를 찾을 수 없어요</Text>
        <Text style={styles.muted}>링크가 잘못됐거나 공개가 해제됐습니다.</Text>
      </View>
    );
  }

  // KR counts collected 시 (fill units); JP/TH count city points
  const filledCities =
    country === 'KR'
      ? regions.filter((r) => visits[r.properties.id]).length
      : share
        ? cities.filter((c) => share.visitedCityIds.has(c.id)).length
        : 0;
  const totalCities = country === 'KR' ? regions.length : cities.length;

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.brandRow}>
          <View style={styles.dot} />
          <Text style={styles.brand}>footprint</Text>
        </View>

        {data.countries.length > 1 && (
          <View style={styles.tabs}>
            {data.countries.map((c) => (
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

        <Text style={styles.heading}>{COUNTRIES[country].nameLocal} 발자국 지도</Text>
        <Text style={styles.sub}>
          채운 도시 {filledCities} / {totalCities} · 총 체크인 {share?.totalVisits ?? 0}회
        </Text>

        <View style={styles.mapWrap}>
          <CountryFillMap
            regions={regions}
            cities={cities}
            visits={visits}
            visitedCityIds={share?.visitedCityIds ?? new Set()}
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
  tabs: { flexDirection: 'row', gap: Space.sm, marginTop: Space.lg },
  tab: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: 999,
    backgroundColor: Palette.bgElevated,
    borderWidth: 1,
    borderColor: Palette.surfaceLine,
  },
  tabActive: { backgroundColor: Palette.gold, borderColor: Palette.gold },
  tabText: { color: Palette.muted, fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: Palette.bg },
  heading: { color: Palette.ink, fontSize: 26, fontWeight: '800', marginTop: Space.lg },
  sub: { color: Palette.gold, fontSize: 15, fontWeight: '600', marginTop: 4 },
  mapWrap: { flex: 1, marginVertical: Space.lg, overflow: 'hidden', borderRadius: 16 },
  title: { color: Palette.ink, fontSize: 20, fontWeight: '700' },
  muted: { color: Palette.muted, fontSize: 14 },
  footer: { color: Palette.muted, fontSize: 13, textAlign: 'center', marginBottom: Space.md },
});
