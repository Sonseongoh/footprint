/**
 * Account & profile screen. Shows whether you're a guest (anonymous) or signed
 * into an email account, lets you set your nickname, and sign up / log in / out.
 * Reached from the records tab header.
 */
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Ionicons } from '@expo/vector-icons';

import { Palette, Space } from '@/constants/footprint-theme';
import {
  deleteAccount,
  getAuthState,
  signInWithEmail,
  signInWithGoogle,
  signOutToGuest,
  signUpWithEmail,
  type AuthState,
} from '@/lib/auth';
import { getMyProfile, setMyNickname } from '@/lib/profile';
import { supabase } from '@/lib/supabase';

export default function AccountScreen() {
  const router = useRouter();
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [a, prof] = await Promise.all([getAuthState(), getMyProfile()]);
    setAuth(a);
    setNickname(prof?.nickname ?? '');
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      load().catch(() => active && setAuth({ email: null, isAnonymous: true }));
      return () => {
        active = false;
      };
    }, [load]),
  );

  // re-read identity whenever the session changes (e.g. Google sign-in finishing
  // asynchronously in the /auth-callback route) so the screen never lags behind.
  // NOTE: Supabase warns against calling auth methods *inside* the callback (it
  // runs under the auth lock) — defer with setTimeout(0) to avoid a deadlock.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(() => {
      setTimeout(() => load().catch(() => {}), 0);
    });
    return () => data.subscription.unsubscribe();
  }, [load]);

  async function onSaveNickname() {
    if (busy) return;
    setBusy(true);
    try {
      await setMyNickname(nickname);
      Alert.alert('저장됨', '닉네임이 저장됐어요.');
    } catch (err) {
      Alert.alert('저장 실패', err instanceof Error ? err.message : '');
    } finally {
      setBusy(false);
    }
  }

  async function onSignUp() {
    if (busy) return;
    setBusy(true);
    try {
      const { needsConfirm } = await signUpWithEmail(email.trim(), password);
      if (needsConfirm) {
        Alert.alert(
          '확인 메일을 보냈어요',
          '메일의 링크를 눌러 가입을 완료해주세요. 메일이 안 보이면 스팸함도 확인해주세요.',
        );
      } else {
        Alert.alert('가입 완료', '계정이 만들어졌어요. 이제 체크인하며 발자국을 모을 수 있어요.');
      }
      setPassword('');
      await load();
    } catch (err) {
      Alert.alert('가입 실패', err instanceof Error ? err.message : '');
    } finally {
      setBusy(false);
    }
  }

  async function onSignIn() {
    if (busy) return;
    setBusy(true);
    try {
      await signInWithEmail(email.trim(), password);
      setPassword('');
      await load();
      Alert.alert('로그인됨', '이 계정으로 전환했어요.');
    } catch (err) {
      Alert.alert('로그인 실패', err instanceof Error ? err.message : '');
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    if (busy) return;
    setBusy(true);
    try {
      const { canceled } = await signInWithGoogle();
      if (!canceled) {
        await load();
        Alert.alert('로그인됨', '구글 계정으로 로그인했어요.');
      }
    } catch (err) {
      Alert.alert('구글 로그인 실패', err instanceof Error ? err.message : '');
    } finally {
      setBusy(false);
    }
  }

  function onDeleteAccount() {
    Alert.alert(
      '계정 삭제',
      '계정과 모든 기록(체크인, 지도, 여행 공유, 사진)이 영구 삭제됩니다. 되돌릴 수 없어요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () =>
            Alert.alert('정말 삭제할까요?', '이 작업은 되돌릴 수 없습니다.', [
              { text: '취소', style: 'cancel' },
              {
                text: '영구 삭제',
                style: 'destructive',
                onPress: async () => {
                  setBusy(true);
                  try {
                    await deleteAccount();
                    setEmail('');
                    setPassword('');
                    await load();
                    Alert.alert('삭제됐어요', '계정과 모든 기록이 삭제되었습니다.');
                  } catch (err) {
                    Alert.alert('삭제 실패', err instanceof Error ? err.message : '');
                  } finally {
                    setBusy(false);
                  }
                },
              },
            ]),
        },
      ],
    );
  }

  function onSignOut() {
    Alert.alert('로그아웃', '게스트로 돌아갑니다. 이 기기의 지도는 초기화돼요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await signOutToGuest();
            setEmail('');
            setPassword('');
            await load();
          } catch (err) {
            Alert.alert('오류', err instanceof Error ? err.message : '');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
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

        {!auth ? (
          <ActivityIndicator color={Palette.gold} style={{ marginTop: Space.xl }} />
        ) : (
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>계정</Text>

            {/* current identity */}
            <View style={styles.card}>
              <Text style={styles.cardLabel}>현재 상태</Text>
              <Text style={styles.identity}>
                {auth.isAnonymous ? '게스트 (익명)' : auth.email}
              </Text>
              {auth.isAnonymous && (
                <Text style={styles.hint}>
                  게스트는 둘러보기만 할 수 있어요. 계정을 만들면 체크인하고 발자국을 모을 수
                  있어요.
                </Text>
              )}
            </View>

            {/* nickname */}
            <View style={styles.card}>
              <Text style={styles.cardLabel}>닉네임 (여행 공유 작성자로 표시)</Text>
              <TextInput
                style={styles.input}
                placeholder="닉네임"
                placeholderTextColor={Palette.muted}
                value={nickname}
                onChangeText={setNickname}
                maxLength={24}
              />
              <Pressable
                style={[styles.btn, busy && styles.btnDim]}
                disabled={busy}
                onPress={onSaveNickname}>
                <Text style={styles.btnText}>닉네임 저장</Text>
              </Pressable>
            </View>

            {/* auth */}
            {auth.isAnonymous ? (
              <View style={styles.card}>
                <Text style={styles.cardLabel}>이메일로 계정 만들기 / 로그인</Text>
                <TextInput
                  style={styles.input}
                  placeholder="이메일"
                  placeholderTextColor={Palette.muted}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoCorrect={false}
                />
                <TextInput
                  style={styles.input}
                  placeholder="비밀번호 (6자 이상)"
                  placeholderTextColor={Palette.muted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />
                <View style={styles.authRow}>
                  <Pressable
                    style={[styles.btnOutline, busy && styles.btnDim]}
                    disabled={busy}
                    onPress={onSignIn}>
                    <Text style={styles.btnOutlineText}>로그인</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.btn, { flex: 1 }, busy && styles.btnDim]}
                    disabled={busy}
                    onPress={onSignUp}>
                    <Text style={styles.btnText}>회원가입</Text>
                  </Pressable>
                </View>

                <View style={styles.divider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>또는</Text>
                  <View style={styles.dividerLine} />
                </View>

                <Pressable
                  style={[styles.googleBtn, busy && styles.btnDim]}
                  disabled={busy}
                  onPress={onGoogle}>
                  <Ionicons name="logo-google" size={18} color={Palette.ink} />
                  <Text style={styles.googleText}>Google로 계속하기</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Pressable
                  style={[styles.signOutBtn, busy && styles.btnDim]}
                  disabled={busy}
                  onPress={onSignOut}>
                  <Text style={styles.signOutText}>로그아웃</Text>
                </Pressable>

                {/* danger zone — permanent account & data deletion (store compliance).
                    Signed-in only: a guest has no account to delete. */}
                <Pressable
                  style={[styles.deleteBtn, busy && styles.btnDim]}
                  disabled={busy}
                  onPress={onDeleteAccount}>
                  <Text style={styles.deleteText}>계정 삭제</Text>
                </Pressable>
              </>
            )}

            <Pressable onPress={() => router.push('/privacy')} hitSlop={8} style={styles.privacyLink}>
              <Text style={styles.privacyLinkText}>개인정보처리방침</Text>
            </Pressable>
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  safe: { flex: 1 },
  header: { paddingHorizontal: Space.lg, paddingTop: Space.sm },
  back: { color: Palette.muted, fontSize: 16, fontWeight: '600' },
  scroll: { padding: Space.lg, gap: Space.md },
  title: { color: Palette.ink, fontSize: 28, fontWeight: '800', marginBottom: Space.xs },
  card: {
    backgroundColor: Palette.bgElevated,
    borderRadius: 16,
    padding: Space.md,
    borderWidth: 1,
    borderColor: Palette.surfaceLine,
    gap: Space.sm,
  },
  cardLabel: { color: Palette.muted, fontSize: 13, fontWeight: '600' },
  identity: { color: Palette.ink, fontSize: 20, fontWeight: '800' },
  hint: { color: Palette.muted, fontSize: 13, lineHeight: 19 },
  input: {
    backgroundColor: Palette.surface,
    borderRadius: 10,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    color: Palette.ink,
    fontSize: 15,
  },
  btn: {
    backgroundColor: Palette.gold,
    borderRadius: 10,
    paddingVertical: Space.sm,
    alignItems: 'center',
  },
  btnDim: { opacity: 0.5 },
  btnText: { color: Palette.bg, fontSize: 14, fontWeight: '700' },
  btnOutline: {
    borderWidth: 1,
    borderColor: Palette.gold,
    borderRadius: 10,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.lg,
    alignItems: 'center',
  },
  btnOutlineText: { color: Palette.gold, fontSize: 14, fontWeight: '700' },
  authRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  divider: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, marginVertical: 2 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Palette.surfaceLine },
  dividerText: { color: Palette.muted, fontSize: 12, fontWeight: '600' },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.surfaceLine,
    borderRadius: 10,
    paddingVertical: Space.sm,
  },
  googleText: { color: Palette.ink, fontSize: 14, fontWeight: '700' },
  deleteBtn: { alignItems: 'center', paddingVertical: Space.md, marginTop: Space.sm },
  deleteText: { color: '#E5705B', fontSize: 14, fontWeight: '700' },
  privacyLink: { alignItems: 'center', paddingVertical: Space.sm },
  privacyLinkText: { color: Palette.muted, fontSize: 13, textDecorationLine: 'underline' },
  signOutBtn: {
    borderWidth: 1,
    borderColor: Palette.surfaceLine,
    borderRadius: 12,
    paddingVertical: Space.md,
    alignItems: 'center',
  },
  signOutText: { color: Palette.muted, fontSize: 15, fontWeight: '700' },
});
