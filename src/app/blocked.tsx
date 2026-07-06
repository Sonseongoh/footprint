/**
 * 차단 관리 — the full list of users I've blocked, with per-row 해제.
 * Reached from the account screen. Blocking hides an author's 여행 공유 from
 * my feed only; unblocking here makes them visible again (UGC compliance:
 * blocks must be reversible).
 */
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Palette, Space } from '@/constants/footprint-theme';
import { getBlockedUsers, unblockUser, type BlockedUser } from '@/lib/blocks';

export default function BlockedScreen() {
  const router = useRouter();
  const [blocked, setBlocked] = useState<BlockedUser[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getBlockedUsers()
        .then((b) => active && setBlocked(b))
        .catch(() => active && setBlocked([]));
      return () => {
        active = false;
      };
    }, []),
  );

  async function onUnblock(user: BlockedUser) {
    try {
      await unblockUser(user.id);
      setBlocked((prev) => (prev ?? []).filter((b) => b.id !== user.id));
    } catch (err) {
      Alert.alert('해제 실패', err instanceof Error ? err.message : '');
    }
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.back}>‹ 뒤로</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.title}>차단 관리</Text>
          <Text style={styles.sub}>
            차단한 사용자의 여행 공유는 내 화면에 보이지 않아요. 해제하면 다시 보입니다.
          </Text>

          {blocked === null ? (
            <ActivityIndicator color={Palette.gold} style={{ marginTop: Space.xl }} />
          ) : blocked.length === 0 ? (
            <Text style={styles.empty}>차단한 사용자가 없어요.</Text>
          ) : (
            <View style={styles.card}>
              {blocked.map((b) => (
                <View key={b.id} style={styles.row}>
                  <Text style={styles.name}>{b.nickname}</Text>
                  <Pressable style={styles.unblockBtn} hitSlop={8} onPress={() => onUnblock(b)}>
                    <Text style={styles.unblockText}>해제</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  safe: { flex: 1 },
  header: { paddingHorizontal: Space.lg, paddingTop: Space.sm },
  back: { color: Palette.muted, fontSize: 16, fontWeight: '600' },
  scroll: { padding: Space.lg, gap: Space.sm },
  title: { color: Palette.ink, fontSize: 28, fontWeight: '800' },
  sub: { color: Palette.muted, fontSize: 14, lineHeight: 20, marginBottom: Space.sm },
  empty: { color: Palette.muted, fontSize: 15, textAlign: 'center', marginTop: Space.xl },
  card: {
    backgroundColor: Palette.bgElevated,
    borderRadius: 16,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
    borderWidth: 1,
    borderColor: Palette.surfaceLine,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm,
  },
  name: { color: Palette.ink, fontSize: 15, fontWeight: '600' },
  unblockBtn: {
    borderWidth: 1,
    borderColor: Palette.gold,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: Space.md,
  },
  unblockText: { color: Palette.gold, fontSize: 13, fontWeight: '700' },
});
