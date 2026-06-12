/**
 * Records tab — timeline of my check-ins (photo, city, note, date), newest
 * first. Synced rows come from Supabase; still-pending rows from the offline
 * queue show a sync badge.
 */
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Palette, Space } from '@/constants/footprint-theme';
import { cityNameKo, regionNameKo } from '@/data/names-ko';
import { getRecords, type CheckinRecord } from '@/lib/records';
import { COUNTRIES } from '@/types/domain';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export default function RecordsScreen() {
  const [records, setRecords] = useState<CheckinRecord[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const rows = await getRecords();
    setRecords(rows);
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
        <FlatList
          data={records}
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
            <View style={styles.card}>
              {item.photoUrl ? (
                <Image source={{ uri: item.photoUrl }} style={styles.thumb} contentFit="cover" />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]}>
                  <Text style={styles.thumbEmptyText}>📍</Text>
                </View>
              )}
              <View style={styles.body}>
                <View style={styles.row}>
                  <Text style={styles.city}>
                    {item.cityName ? cityNameKo(item.country, item.cityName) : '체크인'}
                  </Text>
                  {item.pendingSync && <Text style={styles.badge}>동기화 대기</Text>}
                </View>
                <Text style={styles.meta}>
                  {COUNTRIES[item.country].nameLocal} · {regionNameKo(item.regionId, item.regionId)}{' '}
                  · {formatDate(item.createdAt)}
                </Text>
                {item.note ? <Text style={styles.note}>“{item.note}”</Text> : null}
              </View>
            </View>
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
  list: { gap: Space.sm, paddingBottom: Space.xl },
  card: {
    flexDirection: 'row',
    gap: Space.md,
    backgroundColor: Palette.bgElevated,
    borderRadius: 16,
    padding: Space.md,
    borderWidth: 1,
    borderColor: Palette.surfaceLine,
  },
  thumb: { width: 64, height: 64, borderRadius: 12, backgroundColor: Palette.surface },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  thumbEmptyText: { fontSize: 22 },
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
  meta: { color: Palette.muted, fontSize: 13 },
  note: { color: Palette.ink, fontSize: 14, marginTop: 2 },
  empty: { alignItems: 'center', marginTop: 80, gap: Space.sm },
  emptyTitle: { color: Palette.ink, fontSize: 17, fontWeight: '700' },
  emptyBody: { color: Palette.muted, fontSize: 14 },
});
