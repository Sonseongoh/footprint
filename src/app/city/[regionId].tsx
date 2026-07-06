/**
 * City detail — public notes ("tips / what's here") for one place
 * (country + region_id). Anyone can read; only someone who checked in here within
 * the last 7 days can write (the DB enforces it via RLS — this screen mirrors the
 * window to show eligibility + a countdown). Reached from the map (tap a region)
 * and the records timeline (tap a check-in).
 */
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Palette, Space } from '@/constants/footprint-theme';
import { loadFillUnits } from '@/data';
import { getAuthState } from '@/lib/auth';
import { blockUser } from '@/lib/blocks';
import { regionNameKo } from '@/data/names-ko';
import { pickFromLibrary, takePhoto } from '@/lib/photo';
import {
  deleteCityNote,
  getCityNoteCount,
  getCityNotes,
  getMyNote,
  getWriteEligibility,
  MAX_NOTE_PHOTOS,
  NOTES_PAGE_SIZE,
  postCityNote,
  reportNote,
  toggleLike,
  updateCityNote,
  WRITE_WINDOW_DAYS,
  type CityNote,
  type NoteSort,
  type WriteEligibility,
} from '@/lib/cityNotes';
import { getMyProfile, setMyNickname } from '@/lib/profile';
import { getRecords, type CheckinRecord } from '@/lib/records';
import { COUNTRIES, type CountryCode } from '@/types/domain';

function relativeDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function daysLeft(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000));
}

/** What the full-screen viewer is showing: a photo set + which one is open. */
interface ViewerState {
  urls: string[];
  index: number;
}

/**
 * Full-screen photo viewer. Pinch-to-zoom + pan; double-tap resets; ✕ closes.
 * With multiple photos: swipe left/right (while not zoomed) or tap the edge
 * chevrons to move between them — an "n / m" counter shows the position.
 */
function PhotoViewer({ photos, onClose }: { photos: ViewerState | null; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  // arrows/counter overlay — single-tap toggles it so photos can be viewed clean
  const [chromeVisible, setChromeVisible] = useState(true);
  const urls = photos?.urls ?? [];
  const url = urls[index] ?? null;

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  const resetTransform = useCallback(() => {
    scale.value = 1;
    savedScale.value = 1;
    tx.value = 0;
    ty.value = 0;
    savedTx.value = 0;
    savedTy.value = 0;
  }, [scale, savedScale, tx, ty, savedTx, savedTy]);

  // opening a new set → jump to its start photo, overlay back on
  useEffect(() => {
    if (photos) {
      setIndex(photos.index);
      setChromeVisible(true);
    }
  }, [photos]);
  useEffect(() => {
    resetTransform();
  }, [photos, index, resetTransform]);

  const step = useCallback(
    (dir: number) => {
      setIndex((i) => Math.min(Math.max(i + dir, 0), Math.max(urls.length - 1, 0)));
    },
    [urls.length],
  );
  const toggleChrome = useCallback(() => setChromeVisible((v) => !v), []);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(Math.max(savedScale.value * e.scale, 1), 6);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });
  const pan = Gesture.Pan()
    .onUpdate((e) => {
      tx.value = savedTx.value + e.translationX;
      ty.value = savedTy.value + e.translationY;
    })
    .onEnd((e) => {
      // not zoomed → a horizontal drag is a photo swipe, not a pan
      if (scale.value <= 1.01 && Math.abs(e.translationX) > 60) {
        scheduleOnRN(step, e.translationX < 0 ? 1 : -1);
        tx.value = 0;
        ty.value = 0;
        savedTx.value = 0;
        savedTy.value = 0;
        return;
      }
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      scale.value = 1;
      savedScale.value = 1;
      tx.value = 0;
      ty.value = 0;
      savedTx.value = 0;
      savedTy.value = 0;
    });
  // single tap toggles the overlay. Priority: doubleTap > pan > singleTap —
  // pan must outrank the tap or a quick swipe registers as a tap (toggling the
  // overlay instead of changing photos); the tap only wins when the finger
  // doesn't move.
  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .maxDistance(10)
    .onEnd((_e, success) => {
      if (success) scheduleOnRN(toggleChrome);
    });
  const gesture = Gesture.Simultaneous(Gesture.Exclusive(doubleTap, pan, singleTap), pinch);

  const imgStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  const multi = urls.length > 1;
  return (
    <Modal visible={!!photos} transparent animationType="fade" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.viewerRoot}>
        <GestureDetector gesture={gesture}>
          <Animated.View style={styles.viewerBody}>
            {url && (
              <Animated.View style={[styles.viewerImageWrap, imgStyle]}>
                <Image source={{ uri: url }} style={styles.viewerImage} contentFit="contain" />
              </Animated.View>
            )}
          </Animated.View>
        </GestureDetector>

        {multi && chromeVisible && index > 0 && (
          <Pressable style={[styles.viewerNav, styles.viewerNavLeft]} hitSlop={8} onPress={() => step(-1)}>
            <Ionicons name="chevron-back" size={30} color="rgba(255,255,255,0.85)" />
          </Pressable>
        )}
        {multi && chromeVisible && index < urls.length - 1 && (
          <Pressable style={[styles.viewerNav, styles.viewerNavRight]} hitSlop={8} onPress={() => step(1)}>
            <Ionicons name="chevron-forward" size={30} color="rgba(255,255,255,0.85)" />
          </Pressable>
        )}
        {multi && chromeVisible && (
          <View style={styles.viewerCounter} pointerEvents="none">
            <Text style={styles.viewerCounterText}>
              {index + 1} / {urls.length}
            </Text>
          </View>
        )}

        <Pressable style={styles.viewerClose} onPress={onClose} hitSlop={12}>
          <Ionicons name="close" size={28} color="#fff" />
        </Pressable>
      </GestureHandlerRootView>
    </Modal>
  );
}

export default function CityScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ regionId: string; country?: string }>();
  const regionId = String(params.regionId ?? '');
  const country = (params.country as CountryCode) ?? 'KR';

  // display name of the place — resolve from the bundled fill units
  const title = useMemo(() => {
    const feat = loadFillUnits(country).find((f) => f.properties.id === regionId);
    const raw = feat?.properties.name ?? regionId;
    return country === 'KR' ? raw : regionNameKo(regionId, raw);
  }, [country, regionId]);

  const [otherNotes, setOtherNotes] = useState<CityNote[]>([]);
  const [noteCount, setNoteCount] = useState(0);
  const [sort, setSort] = useState<NoteSort>('popular');
  const [loadingMore, setLoadingMore] = useState(false);
  const sortRef = useRef<NoteSort>('popular');
  const offsetRef = useRef(0);
  const hasMoreRef = useRef(true);
  const loadingRef = useRef(false);
  const [myCheckins, setMyCheckins] = useState<CheckinRecord[]>([]);
  const [elig, setElig] = useState<WriteEligibility | null>(null);
  const [myNote, setMyNote] = useState<CityNote | null>(null);
  const [nickname, setNickname] = useState<string | null>(null);
  // guests are viewers: likes/reports route to login instead of writing
  const [isGuest, setIsGuest] = useState(true);
  const [loaded, setLoaded] = useState(false);

  const [draft, setDraft] = useState('');
  const [nickDraft, setNickDraft] = useState('');
  const [saving, setSaving] = useState(false);
  // false = show my note as a read card with a 수정 button; true = compose/edit
  const [editing, setEditing] = useState(false);
  // photo set open in the full-screen viewer (null = closed)
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  // photo compose state: ordered list of attachments. `existingPath` is set for
  // photos already on the note (edit mode), null for freshly picked local ones.
  const [photos, setPhotos] = useState<{ uri: string; existingPath: string | null }[]>([]);

  // fetch one page of public notes (reset = restart from the top, e.g. on sort
  // change or full reload; otherwise append for infinite scroll)
  const fetchNotesPage = useCallback(
    async (reset: boolean) => {
      if (!reset && (loadingRef.current || !hasMoreRef.current)) return;
      loadingRef.current = true;
      if (reset) {
        offsetRef.current = 0;
        hasMoreRef.current = true;
      } else {
        setLoadingMore(true);
      }
      try {
        const { notes, rawCount } = await getCityNotes(country, regionId, {
          sort: sortRef.current,
          offset: offsetRef.current,
        });
        // advance by the pre-filter count — blocked authors are removed from
        // `notes` but still occupy rows in the server's ordering
        offsetRef.current += rawCount;
        hasMoreRef.current = rawCount === NOTES_PAGE_SIZE;
        const others = notes.filter((n) => !n.mine);
        setOtherNotes((prev) => (reset ? others : [...prev, ...others]));
      } finally {
        loadingRef.current = false;
        setLoadingMore(false);
      }
    },
    [country, regionId],
  );

  const load = useCallback(async () => {
    const [e, mine, prof, recs, count, auth] = await Promise.all([
      getWriteEligibility(country, regionId),
      getMyNote(country, regionId),
      getMyProfile(),
      getRecords(),
      getCityNoteCount(country, regionId),
      getAuthState().catch(() => ({ email: null, isAnonymous: true })),
    ]);
    setIsGuest(auth.isAnonymous);
    setMyCheckins(recs.records.filter((r) => r.country === country && r.regionId === regionId));
    setElig(e);
    setMyNote(mine);
    setNoteCount(count);
    setNickname(prof?.nickname ?? null);
    setDraft(mine?.body ?? '');
    setPhotos(
      mine ? mine.photoPaths.map((path, i) => ({ uri: mine.photoUrls[i], existingPath: path })) : [],
    );
    setEditing(false);
    await fetchNotesPage(true);
    setLoaded(true);
  }, [country, regionId, fetchNotesPage]);

  function changeSort(s: NoteSort) {
    if (s === sortRef.current) return;
    sortRef.current = s;
    setSort(s);
    fetchNotesPage(true);
  }

  // guests can look but not touch — explain and route to login
  function requireLogin(action: string): boolean {
    if (!isGuest) return false;
    Alert.alert('로그인이 필요해요', `${action}하려면 계정으로 로그인해 주세요.`, [
      { text: '취소', style: 'cancel' },
      { text: '로그인', onPress: () => router.push('/account') },
    ]);
    return true;
  }

  function onToggleLike(note: CityNote) {
    if (requireLogin('좋아요')) return;
    const liked = !note.likedByMe;
    const apply = (d: number, on: boolean) =>
      setOtherNotes((prev) =>
        prev.map((n) =>
          n.id === note.id ? { ...n, likedByMe: on, likeCount: Math.max(0, n.likeCount + d) } : n,
        ),
      );
    apply(liked ? 1 : -1, liked); // optimistic
    toggleLike(note.id, liked).catch(() => apply(liked ? -1 : 1, !liked)); // revert on error
  }

  function onReport(note: CityNote) {
    if (requireLogin('신고')) return;
    Alert.alert(`${note.authorNickname}님의 여행 공유`, undefined, [
      { text: '취소', style: 'cancel' },
      {
        text: '이 글 신고하기',
        style: 'destructive',
        onPress: () => {
          reportNote(note.id)
            .then(() => Alert.alert('신고됐어요', '검토 후 조치할게요. 알려주셔서 감사합니다.'))
            .catch((e) => Alert.alert('신고 실패', e instanceof Error ? e.message : ''));
        },
      },
      {
        text: '이 작성자 차단하기',
        style: 'destructive',
        onPress: () => {
          Alert.alert(
            '작성자 차단',
            `${note.authorNickname}님의 여행 공유가 더 이상 보이지 않아요. 계정 화면에서 언제든 해제할 수 있어요.`,
            [
              { text: '취소', style: 'cancel' },
              {
                text: '차단',
                style: 'destructive',
                onPress: () => {
                  blockUser(note.userId)
                    .then(() =>
                      // remove everything by this author from the visible list now
                      setOtherNotes((prev) => prev.filter((n) => n.userId !== note.userId)),
                    )
                    .catch((e) => Alert.alert('차단 실패', e instanceof Error ? e.message : ''));
                },
              },
            ],
          );
        },
      },
    ]);
  }

  function onNotesScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 400) {
      fetchNotesPage(false);
    }
  }

  // discard edits and drop back to the read view (compose state ← my saved note)
  function cancelEdit() {
    setDraft(myNote?.body ?? '');
    setPhotos(
      myNote ? myNote.photoPaths.map((path, i) => ({ uri: myNote.photoUrls[i], existingPath: path })) : [],
    );
    setEditing(false);
  }

  useFocusEffect(
    useCallback(() => {
      let active = true;
      load().catch(() => active && setLoaded(true));
      return () => {
        active = false;
      };
    }, [load]),
  );

  async function onSave() {
    if (saving) return;
    const body = draft.trim();
    if (!body) return;
    setSaving(true);
    try {
      // set nickname first if the author hasn't picked one yet
      if (!nickname) {
        await setMyNickname(nickDraft);
      }
      const newPhotoUris = photos.filter((p) => !p.existingPath).map((p) => p.uri);
      const keepPaths = photos.map((p) => p.existingPath).filter((p): p is string => Boolean(p));
      if (myNote) {
        await updateCityNote(myNote.id, body, {
          newPhotoUris,
          keepPaths,
          prevPaths: myNote.photoPaths,
        });
      } else {
        await postCityNote({ country, regionId, cityName: title, body, photoUris: newPhotoUris });
      }
      await load();
    } catch (err) {
      Alert.alert('저장 실패', err instanceof Error ? err.message : '잠시 후 다시 시도해주세요');
    } finally {
      setSaving(false);
    }
  }

  async function onAddPhoto(fromCamera: boolean) {
    const remaining = MAX_NOTE_PHOTOS - photos.length;
    if (remaining <= 0) {
      Alert.alert('사진 개수 제한', `사진은 최대 ${MAX_NOTE_PHOTOS}장까지 넣을 수 있어요`);
      return;
    }
    try {
      if (fromCamera) {
        const uri = await takePhoto();
        if (uri) setPhotos((prev) => [...prev, { uri, existingPath: null }]);
      } else {
        const uris = await pickFromLibrary(remaining);
        if (uris.length) {
          setPhotos((prev) => [
            ...prev,
            ...uris.slice(0, remaining).map((uri) => ({ uri, existingPath: null })),
          ]);
        }
      }
    } catch (err) {
      Alert.alert('사진 오류', err instanceof Error ? err.message : '사진을 불러오지 못했어요');
    }
  }

  function onRemovePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  function onDelete() {
    if (!myNote) return;
    Alert.alert('여행 공유 삭제', '이 여행 공유를 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCityNote(myNote.id, myNote.photoPaths);
            setDraft('');
            await load();
          } catch (err) {
            Alert.alert('삭제 실패', err instanceof Error ? err.message : '');
          }
        },
      },
    ]);
  }

  const canWrite = elig?.eligible ?? false;
  const canSave = !saving && draft.trim().length > 0 && (Boolean(nickname) || nickDraft.trim().length > 0);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.back}>‹ 뒤로</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          onScroll={onNotesScroll}
          scrollEventThrottle={400}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.sub}>
            {COUNTRIES[country].nameLocal} · 가본 사람들의 여행 공유 {noteCount}
          </Text>

          {!loaded ? (
            <ActivityIndicator color={Palette.gold} style={{ marginTop: Space.lg }} />
          ) : (
            <>
              {/* ── 내 체크인 (private) ── */}
              {myCheckins.length > 0 && (
                <View style={styles.section}>
                  <View style={styles.sectionHead}>
                    <Ionicons name="lock-closed" size={13} color={Palette.muted} />
                    <Text style={styles.sectionTitle}>내 체크인</Text>
                    <Text style={styles.sectionTag}>나만 봐요</Text>
                  </View>
                  {myCheckins.map((c) => (
                    <View key={c.id} style={styles.checkinRow}>
                      {c.photoUrls.length > 0 ? (
                        <Pressable onPress={() => setViewer({ urls: c.photoUrls, index: 0 })}>
                          <Image source={{ uri: c.photoUrls[0] }} style={styles.checkinThumb} contentFit="cover" />
                          {c.photoUrls.length > 1 && (
                            <View style={styles.checkinThumbCount}>
                              <Text style={styles.checkinThumbCountText}>{c.photoUrls.length}</Text>
                            </View>
                          )}
                        </Pressable>
                      ) : (
                        <View style={[styles.checkinThumb, styles.checkinThumbEmpty]}>
                          <Ionicons name="location" size={18} color={Palette.muted} />
                        </View>
                      )}
                      <View style={styles.checkinBody}>
                        <Text style={styles.checkinDate}>{relativeDate(c.createdAt)}</Text>
                        <Text style={c.note ? styles.checkinNote : styles.checkinNoteEmpty}>
                          {c.note ? `“${c.note}”` : '체크인 메모 없음'}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* ── 여행 공유 (public) ── */}
              <View style={styles.sectionHead}>
                <Ionicons name="earth" size={13} color={Palette.gold} />
                <Text style={styles.sectionTitleGold}>여행 공유</Text>
                <Text style={styles.sectionTagGold}>공개</Text>
              </View>

              {/* my existing note — read view with an explicit 수정 button */}
              {myNote && !editing && (
                <View style={styles.myNoteCard}>
                  <View style={styles.composeHead}>
                    <Text style={styles.composeTitle}>내 여행 공유</Text>
                    {/* deletion is ALWAYS allowed (server has no time gate on it —
                        only edits close after 7 days); keep it outside canWrite so
                        an accidental overshare can be removed anytime */}
                    <Pressable onPress={onDelete} hitSlop={8} style={styles.trashBtn}>
                      <Ionicons name="trash-outline" size={20} color={Palette.muted} />
                    </Pressable>
                  </View>
                  <Text style={styles.noteBody}>{myNote.body}</Text>
                  <NotePhotos
                    urls={myNote.photoUrls}
                    onPress={(i) => setViewer({ urls: myNote.photoUrls, index: i })}
                  />
                  {myNote.likeCount > 0 && (
                    <View style={styles.likeBtn}>
                      <Ionicons name="heart" size={16} color={Palette.gold} />
                      <Text style={styles.likeCount}>{myNote.likeCount}</Text>
                    </View>
                  )}
                  {canWrite ? (
                    <View style={styles.cardFooter}>
                      {elig?.expiresAt && (
                        <Text style={styles.window}>D-{daysLeft(elig.expiresAt)} 수정 가능</Text>
                      )}
                      <View style={{ flex: 1 }} />
                      <Pressable style={styles.editBtn} onPress={() => setEditing(true)}>
                        <Text style={styles.editBtnText}>수정</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Text style={styles.lockedBody}>
                      체크인 후 {WRITE_WINDOW_DAYS}일이 지나 수정할 수 없어요. 다시 방문해 체크인하면 또 공유할 수 있어요.
                    </Text>
                  )}
                </View>
              )}

              {/* compose box — new note, or editing my existing one */}
              {canWrite && (!myNote || editing) && (
                <View style={styles.composeCard}>
                  <View style={styles.composeHead}>
                    <Text style={styles.composeTitle}>
                      {editing ? '여행 공유 수정' : '이 도시 여행 공유하기'}
                    </Text>
                  </View>
                  <Text style={styles.publicHint}>🌍 이 도시를 방문한 다른 여행자에게 공개돼요</Text>
                  {!nickname && (
                    <TextInput
                      style={styles.nickInput}
                      placeholder="닉네임 (작성자로 표시돼요)"
                      placeholderTextColor={Palette.muted}
                      value={nickDraft}
                      onChangeText={setNickDraft}
                      maxLength={24}
                    />
                  )}
                  <TextInput
                    style={styles.input}
                    placeholder="이 도시에 뭐가 있는지, 어디가 좋았는지 다른 여행자에게 공유해주세요"
                    placeholderTextColor={Palette.muted}
                    value={draft}
                    onChangeText={setDraft}
                    multiline
                    maxLength={500}
                  />
                  {photos.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbStrip}>
                      {photos.map((p, i) => (
                        <View key={`${p.uri}-${i}`} style={styles.thumbWrap}>
                          <Image source={{ uri: p.uri }} style={styles.thumb} contentFit="cover" />
                          <Pressable style={styles.thumbRemove} onPress={() => onRemovePhoto(i)} hitSlop={6}>
                            <Text style={styles.thumbRemoveText}>✕</Text>
                          </Pressable>
                        </View>
                      ))}
                    </ScrollView>
                  )}
                  {photos.length < MAX_NOTE_PHOTOS && (
                    <View style={styles.photoButtons}>
                      <Pressable style={styles.photoBtn} onPress={() => onAddPhoto(false)}>
                        <Text style={styles.photoBtnText}>🖼 앨범</Text>
                      </Pressable>
                      <Pressable style={styles.photoBtn} onPress={() => onAddPhoto(true)}>
                        <Text style={styles.photoBtnText}>📷 촬영</Text>
                      </Pressable>
                    </View>
                  )}
                  <View style={styles.cardFooter}>
                    {elig?.expiresAt && (
                      <Text style={styles.window}>D-{daysLeft(elig.expiresAt)} 작성 가능</Text>
                    )}
                    <View style={{ flex: 1 }} />
                    {editing && (
                      <Pressable onPress={cancelEdit} hitSlop={8} style={styles.cancelBtn}>
                        <Text style={styles.delete}>취소</Text>
                      </Pressable>
                    )}
                    <Pressable
                      style={[styles.saveBtn, !canSave && styles.saveBtnDim]}
                      disabled={!canSave}
                      onPress={onSave}>
                      <Text style={styles.saveBtnText}>{saving ? '저장 중…' : '저장'}</Text>
                    </Pressable>
                  </View>
                </View>
              )}

              {/* can't write and have no note here — explain how to unlock */}
              {!canWrite && !myNote && (
                <View style={styles.lockedCard}>
                  {isGuest ? (
                    <>
                      <Text style={styles.lockedTitle}>여행 공유는 로그인하고 남길 수 있어요</Text>
                      <Text style={styles.lockedBody}>
                        로그인하고 이 도시에 체크인하면 {WRITE_WINDOW_DAYS}일 동안 여행 공유를 남길 수
                        있어요.
                      </Text>
                      <Pressable style={styles.lockedLoginBtn} onPress={() => router.push('/account')}>
                        <Text style={styles.lockedLoginText}>로그인하기</Text>
                      </Pressable>
                    </>
                  ) : (
                    <>
                      <Text style={styles.lockedTitle}>
                        {elig?.lastVisitAt ? '공유 기간이 끝났어요' : '아직 여행 공유를 남길 수 없어요'}
                      </Text>
                      <Text style={styles.lockedBody}>
                        {elig?.lastVisitAt
                          ? `체크인 후 ${WRITE_WINDOW_DAYS}일 동안만 공유할 수 있어요. 다시 방문해 체크인하면 또 남길 수 있어요.`
                          : `이 도시에 체크인하면 ${WRITE_WINDOW_DAYS}일 동안 여행 공유를 남길 수 있어요.`}
                      </Text>
                    </>
                  )}
                </View>
              )}
            </>
          )}

          {/* sort toggle for everyone else's shares */}
          {loaded && otherNotes.length > 0 && (
            <View style={styles.sortRow}>
              <Pressable onPress={() => changeSort('popular')} hitSlop={6}>
                <Text style={[styles.sortItem, sort === 'popular' && styles.sortItemOn]}>추천순</Text>
              </Pressable>
              <Text style={styles.sortDot}>·</Text>
              <Pressable onPress={() => changeSort('recent')} hitSlop={6}>
                <Text style={[styles.sortItem, sort === 'recent' && styles.sortItemOn]}>신규순</Text>
              </Pressable>
            </View>
          )}

          {/* everyone else's */}
          <View style={styles.notesList}>
            {otherNotes.map((n) => (
              <NoteRow
                key={n.id}
                note={n}
                onPhotoPress={(urls, index) => setViewer({ urls, index })}
                onToggleLike={onToggleLike}
                onReport={onReport}
              />
            ))}
            {loadingMore && <ActivityIndicator color={Palette.gold} style={{ marginVertical: Space.md }} />}
            {loaded && noteCount === 0 && (
              <Text style={styles.emptyNotes}>아직 이 도시의 여행 공유가 없어요. 첫 공유를 남겨보세요.</Text>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
      <PhotoViewer photos={viewer} onClose={() => setViewer(null)} />
    </View>
  );
}

/** Renders a note's photos: one big image, or a scrollable strip with a count
 *  badge. Tapping reports the INDEX so the viewer can open the whole set there. */
function NotePhotos({ urls, onPress }: { urls: string[]; onPress: (index: number) => void }) {
  if (urls.length === 0) return null;
  if (urls.length === 1) {
    return (
      <Pressable onPress={() => onPress(0)}>
        <Image source={{ uri: urls[0] }} style={styles.notePhoto} contentFit="cover" />
      </Pressable>
    );
  }
  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.notePhotoStrip}>
        {urls.map((url, i) => (
          <Pressable key={`${url}-${i}`} onPress={() => onPress(i)}>
            <Image source={{ uri: url }} style={styles.notePhotoThumb} contentFit="cover" />
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.photoCount} pointerEvents="none">
        <Ionicons name="images" size={12} color="#fff" />
        <Text style={styles.photoCountText}>{urls.length}</Text>
      </View>
    </View>
  );
}

function NoteRow({
  note,
  mineLabel,
  onPhotoPress,
  onToggleLike,
  onReport,
}: {
  note: CityNote;
  mineLabel?: boolean;
  onPhotoPress?: (urls: string[], index: number) => void;
  onToggleLike?: (note: CityNote) => void;
  onReport?: (note: CityNote) => void;
}) {
  return (
    <View style={styles.noteRow}>
      <View style={styles.noteHead}>
        <Text style={styles.author}>{mineLabel ? '나' : note.authorNickname}</Text>
        <Text style={styles.noteDate}>{relativeDate(note.createdAt)}</Text>
      </View>
      <Text style={styles.noteBody}>{note.body}</Text>
      <NotePhotos urls={note.photoUrls} onPress={(i) => onPhotoPress?.(note.photoUrls, i)} />
      <View style={styles.noteFooter}>
        {/* report/block menu — only on other people's shares */}
        {onReport && !note.mine ? (
          <Pressable style={styles.reportBtn} hitSlop={8} onPress={() => onReport(note)}>
            <Ionicons name="ellipsis-horizontal" size={16} color={Palette.muted} />
          </Pressable>
        ) : (
          <View />
        )}
        <Pressable
          style={styles.likeBtn}
          hitSlop={8}
          onPress={onToggleLike ? () => onToggleLike(note) : undefined}>
          <Ionicons
            name={note.likedByMe ? 'heart' : 'heart-outline'}
            size={18}
            color={note.likedByMe ? Palette.gold : Palette.muted}
          />
          {note.likeCount > 0 && <Text style={styles.likeCount}>{note.likeCount}</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  safe: { flex: 1 },
  header: { paddingHorizontal: Space.lg, paddingTop: Space.sm },
  back: { color: Palette.muted, fontSize: 16, fontWeight: '600' },
  scroll: { padding: Space.lg, paddingBottom: Space.xxl, gap: Space.sm },
  title: { color: Palette.ink, fontSize: 28, fontWeight: '800' },
  sub: { color: Palette.muted, fontSize: 14, marginBottom: Space.sm },

  section: { gap: Space.sm, marginBottom: Space.lg },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Space.sm },
  sectionTitle: { color: Palette.ink, fontSize: 16, fontWeight: '800' },
  sectionTitleGold: { color: Palette.gold, fontSize: 16, fontWeight: '800' },
  sectionTag: {
    color: Palette.muted,
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: 'rgba(136,147,184,0.16)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  sectionTagGold: {
    color: Palette.gold,
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: 'rgba(245,194,107,0.14)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  checkinRow: {
    flexDirection: 'row',
    gap: Space.md,
    alignItems: 'center',
    backgroundColor: Palette.bgElevated,
    borderRadius: 14,
    padding: Space.sm,
    borderWidth: 1,
    borderColor: Palette.surfaceLine,
  },
  checkinThumb: { width: 52, height: 52, borderRadius: 10, backgroundColor: Palette.surface },
  checkinThumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  checkinThumbCount: {
    position: 'absolute',
    bottom: 3,
    right: 3,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkinThumbCountText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  checkinBody: { flex: 1, gap: 2 },
  checkinDate: { color: Palette.muted, fontSize: 12 },
  checkinNote: { color: Palette.ink, fontSize: 14 },
  checkinNoteEmpty: { color: Palette.muted, fontSize: 13, fontStyle: 'italic' },

  composeCard: {
    backgroundColor: Palette.bgElevated,
    borderRadius: 16,
    padding: Space.md,
    borderWidth: 1,
    borderColor: Palette.surfaceLine,
    gap: Space.sm,
  },
  myNoteCard: {
    backgroundColor: Palette.bgElevated,
    borderRadius: 16,
    padding: Space.md,
    borderWidth: 1,
    borderColor: Palette.gold,
    gap: Space.sm,
  },
  editBtn: {
    borderWidth: 1,
    borderColor: Palette.gold,
    borderRadius: 10,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.sm,
  },
  editBtnText: { color: Palette.gold, fontSize: 14, fontWeight: '700' },
  trashBtn: { padding: 2 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  cancelBtn: { paddingHorizontal: Space.sm, paddingVertical: Space.sm },
  composeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 24 },
  composeTitle: { color: Palette.ink, fontSize: 16, fontWeight: '700' },
  publicHint: { color: Palette.gold, fontSize: 12, fontWeight: '600' },
  window: { color: Palette.gold, fontSize: 12, fontWeight: '700' },
  nickInput: {
    backgroundColor: Palette.surface,
    borderRadius: 10,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    color: Palette.ink,
    fontSize: 15,
  },
  input: {
    backgroundColor: Palette.surface,
    borderRadius: 10,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    color: Palette.ink,
    fontSize: 15,
    minHeight: 88,
    textAlignVertical: 'top',
  },
  photoButtons: { flexDirection: 'row', gap: Space.sm },
  photoBtn: {
    flex: 1,
    backgroundColor: Palette.surface,
    borderRadius: 10,
    paddingVertical: Space.sm,
    alignItems: 'center',
  },
  photoBtnText: { color: Palette.ink, fontSize: 14, fontWeight: '600' },
  thumbStrip: { gap: Space.sm, paddingVertical: 2 },
  thumbWrap: { position: 'relative' },
  thumb: { width: 84, height: 84, borderRadius: 10, backgroundColor: Palette.surface },
  thumbRemove: {
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
  thumbRemoveText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  composeActions: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  delete: { color: Palette.muted, fontSize: 14, fontWeight: '600' },
  saveBtn: {
    backgroundColor: Palette.gold,
    borderRadius: 10,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.sm,
  },
  saveBtnDim: { opacity: 0.5 },
  saveBtnText: { color: Palette.bg, fontSize: 14, fontWeight: '700' },

  lockedCard: {
    backgroundColor: Palette.bgElevated,
    borderRadius: 16,
    padding: Space.md,
    borderWidth: 1,
    borderColor: Palette.surfaceLine,
    gap: 4,
  },
  lockedTitle: { color: Palette.ink, fontSize: 15, fontWeight: '700' },
  lockedBody: { color: Palette.muted, fontSize: 13, lineHeight: 19 },
  lockedLoginBtn: {
    marginTop: Space.xs,
    alignSelf: 'flex-start',
    backgroundColor: Palette.gold,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: Space.lg,
  },
  lockedLoginText: { color: Palette.bg, fontSize: 13, fontWeight: '700' },

  notesList: { gap: Space.sm, marginTop: Space.md },
  noteRow: {
    backgroundColor: Palette.bgElevated,
    borderRadius: 14,
    padding: Space.md,
    borderWidth: 1,
    borderColor: Palette.surfaceLine,
    gap: 6,
  },
  noteHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  author: { color: Palette.gold, fontSize: 14, fontWeight: '700' },
  noteDate: { color: Palette.muted, fontSize: 12 },
  noteBody: { color: Palette.ink, fontSize: 15, lineHeight: 22 },
  noteFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  reportBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2 },
  reportText: { color: Palette.muted, fontSize: 12, fontWeight: '600' },
  likeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2 },
  likeCount: { color: Palette.muted, fontSize: 13, fontWeight: '700' },
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, marginTop: Space.md },
  sortItem: { color: Palette.muted, fontSize: 13, fontWeight: '600' },
  sortItemOn: { color: Palette.gold, fontWeight: '800' },
  sortDot: { color: Palette.surfaceLine, fontSize: 13 },
  notePhoto: { width: '100%', height: 200, borderRadius: 10, marginTop: 4, backgroundColor: Palette.surface },
  notePhotoStrip: { gap: Space.sm, marginTop: 4, paddingRight: 36 },
  notePhotoThumb: { width: 132, height: 132, borderRadius: 10, backgroundColor: Palette.surface },
  photoCount: {
    position: 'absolute',
    top: 12,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  photoCountText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  emptyNotes: { color: Palette.muted, fontSize: 14, marginTop: Space.md, textAlign: 'center' },
  viewerRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' },
  viewerBody: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  viewerImageWrap: { width: '100%', height: '100%' },
  viewerImage: { width: '100%', height: '100%' },
  viewerClose: {
    position: 'absolute',
    top: 48,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerNav: {
    position: 'absolute',
    top: '50%',
    marginTop: -22,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerNavLeft: { left: 12 },
  viewerNavRight: { right: 12 },
  viewerCounter: {
    position: 'absolute',
    bottom: 42,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  viewerCounterText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
