/**
 * 닉네임 변경 화면. 계정 화면에서 진입. 입력(지우기 X) + 닉네임 추천받기(랜덤
 * 생성) + 하단 변경하기. 닉네임은 여행 공유 작성자로 공개 표시되며 유일해야 한다
 * (중복이면 인라인 에러). 변경 전 확인 팝업으로 공개된다는 점을 알린다.
 */
import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Palette, Space } from '@/constants/footprint-theme';
import { getMyProfile, randomNickname, setMyNickname } from '@/lib/profile';

export default function NicknameScreen() {
  const router = useRouter();
  const [current, setCurrent] = useState('');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getMyProfile()
        .then((p) => {
          if (!active) return;
          setCurrent(p?.nickname ?? '');
          setDraft(p?.nickname ?? '');
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, []),
  );

  const trimmed = draft.trim();
  const changed = trimmed.length > 0 && trimmed !== current;

  function suggest() {
    setError(null);
    setDraft(randomNickname());
  }

  function onSubmit() {
    if (busy || !changed) return;
    Alert.alert('닉네임 변경', `여행 공유에 "${trimmed}" 이름으로 표시돼요.`, [
      { text: '취소', style: 'cancel' },
      { text: '변경하기', onPress: apply },
    ]);
  }

  async function apply() {
    setError(null);
    setBusy(true);
    try {
      await setMyNickname(trimmed);
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : '변경하지 못했어요.');
    } finally {
      setBusy(false);
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

        <View style={styles.body}>
          <Text style={styles.title}>닉네임 변경</Text>
          <Text style={styles.sub}>여행 공유에 작성자 이름으로 표시돼요.</Text>

          <View style={styles.row}>
            <View style={[styles.inputWrap, error && styles.inputError]}>
              <TextInput
                style={styles.input}
                placeholder="닉네임"
                placeholderTextColor={Palette.muted}
                value={draft}
                onChangeText={(t) => {
                  setDraft(t);
                  setError(null);
                }}
                maxLength={24}
                autoCorrect={false}
              />
              {draft.length > 0 && (
                <Pressable hitSlop={8} onPress={() => setDraft('')}>
                  <Ionicons name="close-circle" size={20} color={Palette.muted} />
                </Pressable>
              )}
            </View>
            <Pressable style={styles.suggestBtn} onPress={suggest}>
              <Text style={styles.suggestText}>추천받기</Text>
            </Pressable>
          </View>

          {error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : changed ? (
            <Text style={styles.okText}>멋진 닉네임이네요!</Text>
          ) : (
            <Text style={styles.hintText}>1~24자로 입력해 주세요.</Text>
          )}
        </View>

        <View style={styles.footer}>
          <Pressable
            style={[styles.submit, (!changed || busy) && styles.submitDim]}
            disabled={!changed || busy}
            onPress={onSubmit}>
            <Text style={styles.submitText}>변경하기</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  safe: { flex: 1 },
  header: { paddingHorizontal: Space.lg, paddingTop: Space.sm },
  back: { color: Palette.muted, fontSize: 16, fontWeight: '600' },
  body: { flex: 1, padding: Space.lg, gap: Space.sm },
  title: { color: Palette.ink, fontSize: 28, fontWeight: '800' },
  sub: { color: Palette.muted, fontSize: 14, marginBottom: Space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Palette.surface,
    borderRadius: 10,
    paddingHorizontal: Space.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  inputError: { borderColor: '#E5705B' },
  input: { flex: 1, color: Palette.ink, fontSize: 16, paddingVertical: Space.sm },
  suggestBtn: {
    borderWidth: 1,
    borderColor: Palette.surfaceLine,
    borderRadius: 10,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
  },
  suggestText: { color: Palette.ink, fontSize: 14, fontWeight: '700' },
  errorText: { color: '#E5705B', fontSize: 13 },
  okText: { color: Palette.gold, fontSize: 13 },
  hintText: { color: Palette.muted, fontSize: 13 },
  footer: { padding: Space.lg },
  submit: {
    backgroundColor: Palette.gold,
    borderRadius: 14,
    paddingVertical: Space.md,
    alignItems: 'center',
  },
  submitDim: { opacity: 0.4 },
  submitText: { color: Palette.bg, fontSize: 16, fontWeight: '800' },
});
