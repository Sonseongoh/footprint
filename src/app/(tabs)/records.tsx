/**
 * Records tab — timeline of my check-ins (photo, city, note, date), newest
 * first. Synced rows come from Supabase; still-pending rows from the offline
 * queue show a sync badge.
 */
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Palette, Space } from '@/constants/footprint-theme';
import { loadFillUnits } from '@/data';
import { cityNameKo, regionNameKo } from '@/data/names-ko';
import { getMyNotedPlaceKeys } from '@/lib/cityNotes';
import { getRecords, type CheckinRecord } from '@/lib/records';
import { COUNTRIES, type CountryCode } from '@/types/domain';

/** Resolve a fill unit's display name + parent region from its id, per country. */
function buildFillIndex(): Record<string, { name: string; parent: string }> {
  const idx: Record<string, { name: string; parent: string }> = {};
  for (const c of ['KR', 'JP', 'TH'] as CountryCode[]) {
    for (const f of loadFillUnits(c)) {
      const p = f.properties as { id: string; name: string; regionId?: string };
      idx[`${c}:${p.id}`] = { name: p.name, parent: p.regionId ?? p.id };
    }
  }
  return idx;
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const COUNTRY_FLAG: Record<CountryCode, string> = { KR: '🇰🇷', JP: '🇯🇵', TH: '🇹🇭' };

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export default function RecordsScreen() {
  const router = useRouter();
  const fillIndex = useMemo(buildFillIndex, []);
  const [records, setRecords] = useState<CheckinRecord[]>([]);
  const [notedPlaces, setNotedPlaces] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<CountryCode | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // countries the user actually has records in (drives the filter chips)
  const presentCountries = useMemo(() => {
    const set = new Set(records.map((r) => r.country));
    return (['KR', 'JP', 'TH'] as CountryCode[]).filter((c) => set.has(c));
  }, [records]);
  const shown = filter ? records.filter((r) => r.country === filter) : records;

  const load = useCallback(async () => {
    const [rows, noted] = await Promise.all([getRecords(), getMyNotedPlaceKeys()]);
    setRecords(rows);
    setNotedPlaces(noted);
    setLoaded(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      load().catch(() => active && setLoaded(true));
      return () => {
        active = false;
      };
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load().catch(() => {});
    setRefreshing(false);
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <Text style={styles.title}>기록</Text>

        {presentCountries.length > 1 && (
          <View style={styles.filterRow}>
            <FilterChip label="전체" active={filter === null} onPress={() => setFilter(null)} />
            {presentCountries.map((c) => (
              <FilterChip
                key={c}
                label={COUNTRIES[c].nameLocal}
                active={filter === c}
                onPress={() => setFilter(c)}
              />
            ))}
          </View>
        )}

        <FlatList
          data={shown}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Palette.gold} />
          }
          ListEmptyComponent={
            loaded ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>아직 기록이 없어요</Text>
                <Text style={styles.emptyBody}>체크인하면 여기에 사진과 함께 쌓입니다.</Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() =>
                router.push({
                  pathname: '/city/[regionId]',
                  params: { regionId: item.regionId, country: item.country },
                })
              }>
              {item.photoUrls.length > 0 ? (
                <View>
                  <Image source={{ uri: item.photoUrls[0] }} style={styles.thumb} contentFit="cover" />
                  {item.photoUrls.length > 1 && (
                    <View style={styles.thumbCount}>
                      <Ionicons name="images" size={9} color="#fff" />
                      <Text style={styles.thumbCountText}>{item.photoUrls.length}</Text>
                    </View>
                  )}
                </View>
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]}>
                  <Text style={styles.thumbEmptyText}>{COUNTRY_FLAG[item.country]}</Text>
                </View>
              )}
              <View style={styles.body}>
                <View style={styles.row}>
                  <Text style={styles.city}>
                    {item.country === 'KR'
                      ? (fillIndex[`KR:${item.regionId}`]?.name ?? '체크인')
                      : item.cityName
                        ? cityNameKo(item.country, item.cityName)
                        : '체크인'}
                  </Text>
                  {/* every row is a check-in (private); 공유 is added on top when
                      its city also has a public 여행 공유 */}
                  <View style={styles.privateBadge}>
                    <Ionicons name="location" size={10} color={Palette.muted} />
                    <Text style={styles.privateBadgeText}>체크인</Text>
                  </View>
                  {notedPlaces.has(`${item.country}:${item.regionId}`) && (
                    <View style={styles.noteBadge}>
                      <Ionicons name="earth" size={11} color={Palette.gold} />
                      <Text style={styles.noteBadgeText}>공유</Text>
                    </View>
                  )}
                  {item.pendingSync && <Text style={styles.badge}>동기화 대기</Text>}
                </View>
                <Text style={styles.meta}>
                  {COUNTRIES[item.country].nameLocal} ·{' '}
                  {item.country === 'KR'
                    ? regionNameKo(
                        fillIndex[`KR:${item.regionId}`]?.parent ?? '',
                        fillIndex[`KR:${item.regionId}`]?.name ?? item.regionId,
                      )
                    : regionNameKo(item.regionId, item.regionId)}{' '}
                  · {formatDate(item.createdAt)}
                </Text>
                {item.note ? <Text style={styles.note}>“{item.note}”</Text> : null}
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          )}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  safe: { flex: 1, paddingHorizontal: Space.lg },
  title: { color: Palette.ink, fontSize: 24, fontWeight: '800', marginVertical: Space.md },
  filterRow: { flexDirection: 'row', gap: Space.sm, marginBottom: Space.md },
  chip: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
    borderRadius: 999,
    backgroundColor: Palette.surface,
  },
  chipActive: { backgroundColor: Palette.gold },
  chipText: { color: Palette.muted, fontSize: 14, fontWeight: '600' },
  chipTextActive: { color: Palette.bg, fontWeight: '700' },
  list: { gap: Space.sm, paddingBottom: Space.xl },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    backgroundColor: Palette.bgElevated,
    borderRadius: 16,
    padding: Space.md,
    borderWidth: 1,
    borderColor: Palette.surfaceLine,
  },
  chevron: { color: Palette.muted, fontSize: 22, fontWeight: '400' },
  thumb: { width: 64, height: 64, borderRadius: 12, backgroundColor: Palette.surface },
  thumbCount: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  thumbCountText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  thumbEmptyText: { fontSize: 30 },
  body: { flex: 1, gap: 3, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  city: { color: Palette.ink, fontSize: 17, fontWeight: '700' },
  badge: {
    color: Palette.gold,
    fontSize: 11,
    borderWidth: 1,
    borderColor: Palette.gold,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  noteBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(245,194,107,0.14)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  noteBadgeText: { color: Palette.gold, fontSize: 11, fontWeight: '700' },
  privateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(136,147,184,0.16)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  privateBadgeText: { color: Palette.muted, fontSize: 11, fontWeight: '700' },
  meta: { color: Palette.muted, fontSize: 13 },
  note: { color: Palette.ink, fontSize: 14, marginTop: 2 },
  empty: { alignItems: 'center', marginTop: 80, gap: Space.sm },
  emptyTitle: { color: Palette.ink, fontSize: 17, fontWeight: '700' },
  emptyBody: { color: Palette.muted, fontSize: 14 },
});
