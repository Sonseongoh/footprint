/**
 * Check-in screen (M1 home). The globe entry replaces this in M2.
 *
 * Flow: get GPS → resolveCheckin against every bundled country → show the
 * matched country / prefecture / nearest city (or a clear error) → record
 * locally (syncs to Supabase when a backend is configured).
 */
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Palette, Space } from '@/constants/footprint-theme';
import { availableCountries, loadFillUnits, resolveCheckin, type ResolvedCheckin } from '@/data';
import { cityDisplayKo, regionNameKo } from '@/data/names-ko';
import { getAuthState } from '@/lib/auth';
import { recordCheckin } from '@/lib/checkinService';
import { pickFromLibrary, takePhoto } from '@/lib/photo';
import { ensureAnonymousSession, supabase } from '@/lib/supabase';
import { COUNTRIES, type Position } from '@/types/domain';

type Phase = 'idle' | 'locating' | 'result' | 'denied' | 'done';

/** Max photos per check-in. */
const MAX_CHECKIN_PHOTOS = 5;

const TEST_POINTS: { label: string; pos: Position }[] = [
  { label: '서울', pos: [126.978, 37.5665] },
  { label: '수원', pos: [127.0089, 37.2911] },
  { label: '부산', pos: [129.075, 35.1796] },
  { label: '도쿄', pos: [139.6917, 35.6895] },
  { label: '치앙마이', pos: [98.9853, 18.7883] },
];

// "한국 · 일본 · 태국" — derived from the bundled data so copy can't drift from
// what the app actually supports (the old hardcoded string forgot Thailand).
const SUPPORTED_LABEL = availableCountries()
  .map((c) => COUNTRIES[c].nameLocal)
  .join(' · ');

export default function CheckinScreen() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<ResolvedCheckin | null>(null);
  const [coords, setCoords] = useState<{ pos: Position; accuracyM: number | null } | null>(null);
  const [note, setNote] = useState('');
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [backendReady, setBackendReady] = useState<boolean | null>(null);
  // Guests (anonymous session) can't check in — we route them to login so their
  // footprints are tied to a real account, not an orphaned anonymous user.
  const [isGuest, setIsGuest] = useState(true);

  // Deferred auth: ensure a session exists (anonymous on first launch) so the
  // backend is reachable. Whether the user is a *guest* gates check-in below.
  useEffect(() => {
    ensureAnonymousSession()
      .then((id) => {
        setUserId(id);
        setBackendReady(true);
      })
      .catch(() => setBackendReady(false));
  }, []);

  const refreshAuth = useCallback(async () => {
    const a = await getAuthState();
    setIsGuest(a.isAnonymous);
  }, []);

  // refresh guest state on focus + whenever the session changes (login/logout)
  useFocusEffect(
    useCallback(() => {
      refreshAuth().catch(() => {});
    }, [refreshAuth]),
  );
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(() => {
      setTimeout(() => refreshAuth().catch(() => {}), 0);
    });
    return () => data.subscription.unsubscribe();
  }, [refreshAuth]);

  function regionDisplayName(country: ResolvedCheckin['country'], regionId: string | null) {
    if (!country || !regionId) return '';
    const unit = loadFillUnits(country).find((r) => r.properties.id === regionId);
    const en = unit?.properties.name ?? regionId;
    // KR fill units (시) already carry a Korean name; JP/TH go through the overlay
    return country === 'KR' ? en : regionNameKo(regionId, en);
  }

  function runResolve(pos: Position, accuracyM: number | null) {
    setCoords({ pos, accuracyM });
    setResult(resolveCheckin(pos, accuracyM));
    setPhase('result');
  }

  // Each locate attempt gets an id so 취소 (or a retry) can invalidate a GPS
  // response that arrives late — without this a canceled fix would still flip
  // the screen to a result.
  const locateAttemptRef = useRef(0);
  const GPS_TIMEOUT_MS = 20_000;

  async function handleCheckin() {
    if (isGuest) {
      router.push('/account'); // login required before any check-in
      return;
    }
    const attempt = ++locateAttemptRef.current;
    setPhase('locating');
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (attempt !== locateAttemptRef.current) return; // canceled while asking
    if (status !== 'granted') {
      setPhase('denied');
      return;
    }
    try {
      // indoors/underground a GPS fix can hang forever — cap it and fall
      // through to the no-fix guidance instead of an endless spinner
      const loc = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('gps-timeout')), GPS_TIMEOUT_MS),
        ),
      ]);
      if (attempt !== locateAttemptRef.current) return;
      runResolve([loc.coords.longitude, loc.coords.latitude], loc.coords.accuracy ?? null);
    } catch {
      if (attempt !== locateAttemptRef.current) return;
      setResult({ ok: false, reason: 'no-fix', regionId: null, city: null, country: null });
      setPhase('result');
    }
  }

  function cancelLocating() {
    locateAttemptRef.current += 1; // orphan the in-flight attempt
    setPhase('idle');
  }

  async function handleRecord() {
    if (isGuest) {
      router.push('/account'); // safety net: dev test points bypass handleCheckin
      return;
    }
    if (!result?.ok || !result.country || !coords) return;
    if (saving) return; // double-tap would mint a second event id → double count
    setSaving(true);
    try {
      await recordCheckin({
        userId: userId ?? 'local-only',
        regionId: result.regionId!,
        cityId: result.city?.id ?? null,
        cityName: result.city?.name ?? null,
        country: result.country,
        lat: coords.pos[1],
        lng: coords.pos[0],
        accuracyM: coords.accuracyM,
        note: note.trim() || null,
        photoUris,
      });
      setPhase('done');
      setNote('');
      setPhotoUris([]);
    } catch {
      Alert.alert('저장 실패', '기록을 저장하지 못했어요. 다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setResult(null);
    setCoords(null);
    setNote('');
    setPhotoUris([]);
    setPhase('idle');
  }

  async function addPhoto(source: 'camera' | 'library') {
    const remaining = MAX_CHECKIN_PHOTOS - photoUris.length;
    if (remaining <= 0) return;
    if (source === 'camera') {
      const uri = await takePhoto();
      if (uri) setPhotoUris((prev) => [...prev, uri]);
    } else {
      const uris = await pickFromLibrary(remaining);
      if (uris.length) setPhotoUris((prev) => [...prev, ...uris.slice(0, remaining)]);
    }
  }

  function choosePhoto(source: 'camera' | 'library') {
    setSheetOpen(false);
    addPhoto(source);
  }

  function removePhoto(index: number) {
    setPhotoUris((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <View style={styles.brandRow}>
              <View style={styles.brandDot} />
              <Text style={styles.brand}>footprint</Text>
            </View>
            <Text style={styles.subtitle}>현장 체크인 · {SUPPORTED_LABEL}</Text>
          </View>

          {backendReady === false && (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>
                지금은 연결이 원활하지 않아요. 기록은 이 기기에 안전하게 저장되고, 연결되면 자동으로
                동기화됩니다.
              </Text>
            </View>
          )}

          {phase === 'idle' && (
            <View style={styles.center}>
              {isGuest ? (
                <>
                  <Ionicons name="lock-closed-outline" size={30} color={Palette.muted} />
                  <Text style={styles.hint}>
                    체크인하려면 로그인이 필요해요.{'\n'}로그인하면 어디서든 발자국이 안전하게 저장돼요.
                  </Text>
                </>
              ) : (
                <Text style={styles.hint}>지금 있는 곳을 체크인해 어느 지역인지 인증해보세요.</Text>
              )}
            </View>
          )}

          {phase === 'locating' && (
            <View style={styles.center}>
              <ActivityIndicator color={Palette.gold} />
              <Text style={styles.hint}>위치를 잡는 중…</Text>
            </View>
          )}

          {phase === 'denied' && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>위치 권한이 필요해요</Text>
              <Text style={styles.cardBody}>
                설정에서 위치 접근을 허용하면 현장 인증을 할 수 있습니다.
              </Text>
            </View>
          )}

          {phase === 'result' && result && (
            <View style={styles.card}>
              {result.ok ? (
                <>
                  <Text style={styles.okBadge}>
                    ✓ {result.country ? COUNTRIES[result.country].nameLocal : ''} 인증됨
                  </Text>
                  {/* KR: the matched unit IS the 시 (no city point) → show it big */}
                  <Text style={styles.city}>
                    {result.city
                      ? cityDisplayKo(result.city)
                      : regionDisplayName(result.country, result.regionId) || '도시'}
                  </Text>
                  {result.city && (
                    <Text style={styles.region}>
                      {regionDisplayName(result.country, result.regionId)}
                    </Text>
                  )}
                  <TextInput
                    style={styles.input}
                    placeholder="체크인 메모 · 나만 봐요 (선택)"
                    placeholderTextColor={Palette.muted}
                    value={note}
                    onChangeText={setNote}
                    maxLength={80}
                  />
                  {photoUris.length > 0 ? (
                    <View style={styles.photoStrip}>
                      {photoUris.map((uri, i) => (
                        <View key={`${uri}-${i}`} style={styles.photoTileWrap}>
                          <Image source={{ uri }} style={styles.photoTile} contentFit="cover" />
                          <Pressable
                            style={styles.photoRemove}
                            hitSlop={8}
                            onPress={() => removePhoto(i)}>
                            <Ionicons name="close" size={14} color="#fff" />
                          </Pressable>
                        </View>
                      ))}
                      {photoUris.length < MAX_CHECKIN_PHOTOS && (
                        <Pressable style={styles.photoAddTile} onPress={() => setSheetOpen(true)}>
                          <Ionicons name="add" size={26} color={Palette.muted} />
                        </Pressable>
                      )}
                    </View>
                  ) : (
                    <Pressable style={styles.photoZone} onPress={() => setSheetOpen(true)}>
                      <Ionicons name="camera-outline" size={24} color={Palette.muted} />
                      <Text style={styles.photoZoneLabel}>사진 추가</Text>
                    </Pressable>
                  )}
                </>
              ) : (
                <>
                  <Text style={styles.errTitle}>
                    {result.reason === 'no-region' && '지원 지역이 아니에요'}
                    {result.reason === 'low-accuracy' && 'GPS 정확도가 낮아요'}
                    {result.reason === 'no-fix' && '위치를 못 잡았어요'}
                  </Text>
                  <Text style={styles.cardBody}>
                    {result.reason === 'no-region' &&
                      `지금은 ${SUPPORTED_LABEL}을 지원해요. 해당 국가 안에서 다시 시도해보세요.`}
                    {result.reason === 'low-accuracy' && '잠시 후 야외에서 다시 시도해보세요.'}
                    {result.reason === 'no-fix' && '위치 신호를 확인하고 다시 시도해보세요.'}
                  </Text>
                </>
              )}
            </View>
          )}

          {phase === 'done' && (
            <View style={styles.card}>
              <Text style={styles.okBadge}>체크인 완료</Text>
              <Text style={styles.cardBody}>
                지도에 채워졌어요. 가본 사람으로서 이 도시 추천을 남겨보세요.
              </Text>
              {result?.ok && result.country && result.regionId && (
                <Pressable
                  style={styles.shareCta}
                  onPress={() =>
                    router.push({
                      pathname: '/city/[regionId]',
                      params: { regionId: result.regionId!, country: result.country! },
                    })
                  }>
                  <Text style={styles.shareCtaText}>이 도시 여행 공유하기 →</Text>
                </Pressable>
              )}
            </View>
          )}
        </ScrollView>

        <View style={styles.actions}>
          {phase === 'idle' && (
            <Pressable style={styles.primary} onPress={handleCheckin}>
              <Text style={styles.primaryText}>
                {isGuest ? '로그인하고 체크인하기' : '＋ 지금 여기 체크인'}
              </Text>
            </Pressable>
          )}
          {phase === 'locating' && (
            <Pressable style={styles.cancelBtn} onPress={cancelLocating}>
              <Text style={styles.cancelBtnText}>취소</Text>
            </Pressable>
          )}
          {phase === 'result' && result?.ok && (
            <Pressable
              style={[styles.primary, saving && { opacity: 0.6 }]}
              disabled={saving}
              onPress={handleRecord}>
              <Text style={styles.primaryText}>{saving ? '저장 중…' : '이 도시 기록하기'}</Text>
            </Pressable>
          )}
          {(phase === 'result' || phase === 'denied' || phase === 'done') && (
            <Pressable style={styles.secondary} onPress={reset}>
              <Text style={styles.secondaryText}>다시</Text>
            </Pressable>
          )}
          {phase === 'idle' && !isGuest && (
            <View style={styles.devRow}>
              {TEST_POINTS.map((t) => (
                <Pressable key={t.label} style={styles.devBtn} onPress={() => runResolve(t.pos, 15)}>
                  <Text style={styles.devText}>{t.label}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </SafeAreaView>

      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setSheetOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Pressable style={styles.sheetBtn} onPress={() => choosePhoto('camera')}>
              <Ionicons name="camera" size={20} color={Palette.ink} />
              <Text style={styles.sheetBtnText}>촬영</Text>
            </Pressable>
            <Pressable style={styles.sheetBtn} onPress={() => choosePhoto('library')}>
              <Ionicons name="images" size={20} color={Palette.ink} />
              <Text style={styles.sheetBtnText}>갤러리에서 선택</Text>
            </Pressable>
            <Pressable style={styles.sheetCancel} onPress={() => setSheetOpen(false)}>
              <Text style={styles.sheetCancelText}>취소</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  safe: { flex: 1 },
  content: { flexGrow: 1, padding: Space.lg, gap: Space.lg },
  header: { gap: Space.xs, marginTop: Space.sm },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  brandDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: Palette.gold },
  brand: { color: Palette.ink, fontSize: 22, fontWeight: '700', letterSpacing: -0.5 },
  subtitle: { color: Palette.muted, fontSize: 14 },
  banner: {
    backgroundColor: Palette.bgElevated,
    borderRadius: 12,
    padding: Space.md,
    borderWidth: 1,
    borderColor: Palette.surfaceLine,
  },
  bannerText: { color: Palette.muted, fontSize: 13, lineHeight: 19 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Space.md, minHeight: 240 },
  hint: { color: Palette.muted, fontSize: 16, textAlign: 'center', paddingHorizontal: Space.lg },
  card: {
    backgroundColor: Palette.bgElevated,
    borderRadius: 18,
    padding: Space.lg,
    gap: Space.sm,
    borderWidth: 1,
    borderColor: Palette.surfaceLine,
  },
  cardTitle: { color: Palette.ink, fontSize: 18, fontWeight: '700' },
  cardBody: { color: Palette.muted, fontSize: 15, lineHeight: 22 },
  okBadge: { color: Palette.gold, fontSize: 15, fontWeight: '700' },
  shareCta: {
    marginTop: Space.sm,
    backgroundColor: Palette.gold,
    borderRadius: 12,
    paddingVertical: Space.sm,
    alignItems: 'center',
  },
  shareCtaText: { color: Palette.bg, fontSize: 15, fontWeight: '700' },
  city: { color: Palette.ink, fontSize: 28, fontWeight: '800' },
  region: { color: Palette.muted, fontSize: 16 },
  errTitle: { color: Palette.ink, fontSize: 18, fontWeight: '700' },
  input: {
    marginTop: Space.sm,
    backgroundColor: Palette.surface,
    borderRadius: 12,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    color: Palette.ink,
    fontSize: 16,
  },
  photoZone: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    height: 84,
    marginTop: Space.sm,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Palette.surfaceLine,
    backgroundColor: Palette.surface,
  },
  photoZoneLabel: { color: Palette.muted, fontSize: 14, fontWeight: '600' },
  photoStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm, marginTop: Space.sm },
  photoTileWrap: { position: 'relative' },
  photoTile: { width: 80, height: 80, borderRadius: 12, backgroundColor: Palette.surface },
  photoAddTile: {
    width: 80,
    height: 80,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Palette.surfaceLine,
    backgroundColor: Palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Palette.bgElevated,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Space.lg,
    paddingBottom: Space.xl,
    gap: Space.sm,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Palette.surfaceLine,
    marginBottom: Space.sm,
  },
  sheetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    backgroundColor: Palette.surface,
    borderRadius: 12,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
  },
  sheetBtnText: { color: Palette.ink, fontSize: 16, fontWeight: '600' },
  sheetCancel: { alignItems: 'center', paddingVertical: Space.md, marginTop: 2 },
  sheetCancelText: { color: Palette.muted, fontSize: 15, fontWeight: '700' },
  actions: { padding: Space.lg, gap: Space.sm },
  primary: {
    backgroundColor: Palette.gold,
    borderRadius: 16,
    paddingVertical: Space.md,
    alignItems: 'center',
  },
  primaryText: { color: Palette.bg, fontSize: 16, fontWeight: '700' },
  secondary: { paddingVertical: Space.sm, alignItems: 'center' },
  secondaryText: { color: Palette.muted, fontSize: 15 },
  cancelBtn: {
    borderWidth: 1,
    borderColor: Palette.surfaceLine,
    borderRadius: 16,
    paddingVertical: Space.md,
    alignItems: 'center',
  },
  cancelBtnText: { color: Palette.muted, fontSize: 16, fontWeight: '700' },
  devRow: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: Space.lg },
  devBtn: { paddingVertical: Space.sm, alignItems: 'center' },
  devText: { color: Palette.surfaceLine, fontSize: 13 },
});
