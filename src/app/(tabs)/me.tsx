/**
 * 내 발자국 — personal collection dashboard. Summary counts, per-country fill
 * progress, and the user's own 여행 공유. Reached from the records tab; account
 * settings (login/nickname) live one tap deeper at /account.
 */
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Palette, Space } from '@/constants/footprint-theme';
import { getAuthState } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { getMyNotes, type CityNote } from '@/lib/cityNotes';
import { getMyProfile } from '@/lib/profile';
import { getRecords } from '@/lib/records';
import { getCollectionStats, type CollectionStats } from '@/lib/stats';
import { COUNTRIES } from '@/types/domain';

function yearOf(iso: string): number {
  return new Date(iso).getFullYear();
}
function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export default function MeScreen() {
  const router = useRouter();
  const [nickname, setNickname] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(true);
  const [stats, setStats] = useState<CollectionStats | null>(null);
  const [myNotes, setMyNotes] = useState<CityNote[]>([]);
  const [totalCheckins, setTotalCheckins] = useState(0);
  const [thisYear, setThisYear] = useState(0);
  const [sinceDate, setSinceDate] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // scroll-to-section: tapping a summary stat jumps to its section
  const scrollRef = useRef<ScrollView>(null);
  const progressY = useRef(0);
  const sharesY = useRef(0);
  const scrollToY = (y: number) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });

  const load = useCallback(async () => {
    const [prof, auth, s, notes, recs] = await Promise.all([
      getMyProfile(),
      getAuthState(),
      getCollectionStats(),
      getMyNotes(),
      getRecords(),
    ]);
    setNickname(prof?.nickname ?? null);
    setIsGuest(auth.isAnonymous);
    setStats(s);
    setMyNotes(notes);
    setTotalCheckins(recs.length);
    const y = new Date().getFullYear();
    setThisYear(recs.filter((r) => yearOf(r.createdAt) === y).length);
    setSinceDate(recs.length ? recs[recs.length - 1].createdAt : null);
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

  // refresh when the session changes (login/logout/Google finishing async) so the
  // guest banner and stats reflect the current account without needing a re-focus.
  // Defer with setTimeout(0): Supabase warns against calling auth methods inside
  // the onAuthStateChange callback (it holds the auth lock → potential deadlock).
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(() => {
      setTimeout(() => load().catch(() => {}), 0);
    });
    return () => data.subscription.unsubscribe();
  }, [load]);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title}>내 발자국</Text>
          <Pressable onPress={() => router.push('/account')} hitSlop={12} style={styles.gear}>
            <Ionicons name="settings-outline" size={22} color={Palette.muted} />
          </Pressable>
        </View>

        {!loaded || !stats ? (
          <ActivityIndicator color={Palette.gold} style={{ marginTop: Space.xl }} />
        ) : (
          <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll}>
            <Text style={styles.who}>{isGuest ? '게스트' : nickname || '여행자'}</Text>

            {/* guest → login nudge: this is the primary entry point to sign in */}
            {isGuest && (
              <Pressable style={styles.loginCard} onPress={() => router.push('/account')}>
                <View style={styles.loginIcon}>
                  <Ionicons name="person-circle-outline" size={26} color={Palette.gold} />
                </View>
                <View style={styles.loginBody}>
                  <Text style={styles.loginTitle}>로그인하고 발자국 남기기</Text>
                  <Text style={styles.loginSub}>
                    체크인과 여행 공유는 로그인 후에 할 수 있어요. 발자국은 계정에 안전하게
                    보관됩니다.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Palette.muted} />
              </Pressable>
            )}

            {/* summary — tap a stat to jump to its section */}
            <View style={styles.summary}>
              <Stat n={stats.countriesVisited} label="나라" onPress={() => scrollToY(progressY.current)} />
              <View style={styles.summaryDivider} />
              <Stat n={stats.totalFilled} label="채운 도시" onPress={() => scrollToY(progressY.current)} />
              <View style={styles.summaryDivider} />
              <Stat n={myNotes.length} label="여행 공유" onPress={() => scrollToY(sharesY.current)} />
            </View>
            <Text style={styles.subline}>
              총 체크인 {totalCheckins}회 · 올해 {thisYear}회
              {sinceDate ? ` · ${formatDate(sinceDate)}부터` : ''}
            </Text>

            {/* per-country progress */}
            <Text
              style={styles.sectionTitle}
              onLayout={(e: LayoutChangeEvent) => (progressY.current = e.nativeEvent.layout.y)}>
              나라별 채움
            </Text>
            <View style={styles.progressList}>
              {stats.perCountry.map((c) => {
                const ratio = c.total ? c.filled / c.total : 0;
                return (
                  <Pressable
                    key={c.country}
                    style={styles.progressRow}
                    onPress={() => router.push(`/explore?country=${c.country}`)}>
                    <View style={styles.progressHead}>
                      <Text style={styles.progressName}>{COUNTRIES[c.country].nameLocal}</Text>
                      <Text style={styles.progressCount}>
                        {c.filled} / {c.total}
                      </Text>
                    </View>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${Math.round(ratio * 100)}%` }]} />
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {/* my 여행 공유 */}
            <Text
              style={styles.sectionTitle}
              onLayout={(e: LayoutChangeEvent) => (sharesY.current = e.nativeEvent.layout.y)}>
              내 여행 공유
            </Text>
            <View style={styles.notesList}>
              {myNotes.map((n) => (
                <Pressable
                  key={n.id}
                  style={styles.noteCard}
                  onPress={() =>
                    router.push({
                      pathname: '/city/[regionId]',
                      params: { regionId: n.regionId, country: n.country },
                    })
                  }>
                  {n.photoUrls[0] ? (
                    <Image source={{ uri: n.photoUrls[0] }} style={styles.noteThumb} contentFit="cover" />
                  ) : (
                    <View style={[styles.noteThumb, styles.noteThumbEmpty]}>
                      <Ionicons name="earth" size={18} color={Palette.muted} />
                    </View>
                  )}
                  <View style={styles.noteBody}>
                    <Text style={styles.notePlace}>
                      {n.cityName || n.regionId} · {COUNTRIES[n.country].nameLocal}
                    </Text>
                    <Text style={styles.noteText} numberOfLines={2}>
                      {n.body}
                    </Text>
                  </View>
                  <View style={styles.noteLike}>
                    <Ionicons name="heart" size={14} color={Palette.gold} />
                    <Text style={styles.noteLikeText}>{n.likeCount}</Text>
                  </View>
                </Pressable>
              ))}
              {myNotes.length === 0 && (
                <Text style={styles.empty}>아직 남긴 여행 공유가 없어요. 가본 도시에 추천을 남겨보세요.</Text>
              )}
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

function Stat({ n, label, onPress }: { n: number; label: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.stat, pressed && styles.statPressed]} onPress={onPress}>
      <Text style={styles.statNum}>{n}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.lg,
    paddingTop: Space.sm,
    paddingBottom: Space.xs,
  },
  gear: { padding: 2 },
  scroll: { padding: Space.lg, gap: Space.md, paddingBottom: Space.xxl },
  title: { color: Palette.ink, fontSize: 24, fontWeight: '800' },
  who: { color: Palette.gold, fontSize: 16, fontWeight: '700' },

  loginCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    backgroundColor: Palette.bgElevated,
    borderRadius: 16,
    padding: Space.md,
    borderWidth: 1,
    borderColor: Palette.gold,
    marginTop: Space.xs,
  },
  loginIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(245,194,107,0.12)',
  },
  loginBody: { flex: 1, gap: 2 },
  loginTitle: { color: Palette.ink, fontSize: 15, fontWeight: '800' },
  loginSub: { color: Palette.muted, fontSize: 12, lineHeight: 17 },

  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: Palette.bgElevated,
    borderRadius: 16,
    paddingVertical: Space.md,
    borderWidth: 1,
    borderColor: Palette.surfaceLine,
    marginTop: Space.sm,
  },
  summaryDivider: { width: 1, height: 32, backgroundColor: Palette.surfaceLine },
  stat: { alignItems: 'center', gap: 2, paddingHorizontal: Space.sm, paddingVertical: 2, borderRadius: 10 },
  statPressed: { backgroundColor: Palette.surface },
  statNum: { color: Palette.ink, fontSize: 24, fontWeight: '800' },
  statLabel: { color: Palette.muted, fontSize: 12 },
  subline: { color: Palette.muted, fontSize: 13, textAlign: 'center' },

  sectionTitle: { color: Palette.ink, fontSize: 16, fontWeight: '800', marginTop: Space.md },
  progressList: { gap: Space.sm },
  progressRow: {
    backgroundColor: Palette.bgElevated,
    borderRadius: 14,
    padding: Space.md,
    borderWidth: 1,
    borderColor: Palette.surfaceLine,
    gap: Space.sm,
  },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressName: { color: Palette.ink, fontSize: 15, fontWeight: '700' },
  progressCount: { color: Palette.gold, fontSize: 14, fontWeight: '700' },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: Palette.surface, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4, backgroundColor: Palette.gold },

  notesList: { gap: Space.sm },
  noteCard: {
    flexDirection: 'row',
    gap: Space.md,
    alignItems: 'center',
    backgroundColor: Palette.bgElevated,
    borderRadius: 14,
    padding: Space.sm,
    borderWidth: 1,
    borderColor: Palette.surfaceLine,
  },
  noteThumb: { width: 52, height: 52, borderRadius: 10, backgroundColor: Palette.surface },
  noteThumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  noteBody: { flex: 1, gap: 2 },
  notePlace: { color: Palette.muted, fontSize: 12, fontWeight: '600' },
  noteText: { color: Palette.ink, fontSize: 14 },
  noteLike: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  noteLikeText: { color: Palette.muted, fontSize: 13, fontWeight: '700' },
  empty: { color: Palette.muted, fontSize: 14, textAlign: 'center', marginTop: Space.sm },
});
