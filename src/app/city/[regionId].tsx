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
import { useCallback, useMemo, useState } from 'react';
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

import { Palette, Space } from '@/constants/footprint-theme';
import { loadFillUnits } from '@/data';
import { regionNameKo } from '@/data/names-ko';
import { pickFromLibrary, takePhoto } from '@/lib/photo';
import {
  deleteCityNote,
  getCityNotes,
  getMyNote,
  getWriteEligibility,
  MAX_NOTE_PHOTOS,
  postCityNote,
  updateCityNote,
  WRITE_WINDOW_DAYS,
  type CityNote,
  type WriteEligibility,
} from '@/lib/cityNotes';
import { getMyProfile, setMyNickname } from '@/lib/profile';
import { COUNTRIES, type CountryCode } from '@/types/domain';

function relativeDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function daysLeft(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000));
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

  const [notes, setNotes] = useState<CityNote[]>([]);
  const [elig, setElig] = useState<WriteEligibility | null>(null);
  const [myNote, setMyNote] = useState<CityNote | null>(null);
  const [nickname, setNickname] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [draft, setDraft] = useState('');
  const [nickDraft, setNickDraft] = useState('');
  const [saving, setSaving] = useState(false);
  // false = show my note as a read card with a 수정 button; true = compose/edit
  const [editing, setEditing] = useState(false);
  // photo compose state: ordered list of attachments. `existingPath` is set for
  // photos already on the note (edit mode), null for freshly picked local ones.
  const [photos, setPhotos] = useState<{ uri: string; existingPath: string | null }[]>([]);

  const load = useCallback(async () => {
    const [n, e, mine, prof] = await Promise.all([
      getCityNotes(country, regionId),
      getWriteEligibility(country, regionId),
      getMyNote(country, regionId),
      getMyProfile(),
    ]);
    setNotes(n);
    setElig(e);
    setMyNote(mine);
    setNickname(prof?.nickname ?? null);
    setDraft(mine?.body ?? '');
    setPhotos(
      mine ? mine.photoPaths.map((path, i) => ({ uri: mine.photoUrls[i], existingPath: path })) : [],
    );
    setEditing(false);
    setLoaded(true);
  }, [country, regionId]);

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
    if (photos.length >= MAX_NOTE_PHOTOS) {
      Alert.alert('사진 개수 제한', `사진은 최대 ${MAX_NOTE_PHOTOS}장까지 넣을 수 있어요`);
      return;
    }
    try {
      const uri = fromCamera ? await takePhoto() : await pickFromLibrary();
      if (uri) setPhotos((prev) => [...prev, { uri, existingPath: null }]);
    } catch (err) {
      Alert.alert('사진 오류', err instanceof Error ? err.message : '사진을 불러오지 못했어요');
    }
  }

  function onRemovePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  function onDelete() {
    if (!myNote) return;
    Alert.alert('메모 삭제', '이 메모를 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCityNote(myNote.id);
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
  const otherNotes = notes.filter((n) => !n.mine);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.back}>‹ 뒤로</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.sub}>
            {COUNTRIES[country].nameLocal} · 가본 사람들의 메모 {notes.length}
          </Text>

          {!loaded ? (
            <ActivityIndicator color={Palette.gold} style={{ marginTop: Space.lg }} />
          ) : (
            <>
              {/* my existing note — read view with an explicit 수정 button */}
              {myNote && !editing && (
                <View style={styles.myNoteCard}>
                  <View style={styles.composeHead}>
                    <Text style={styles.composeTitle}>내 메모</Text>
                    {canWrite && (
                      <Pressable onPress={onDelete} hitSlop={8} style={styles.trashBtn}>
                        <Ionicons name="trash-outline" size={20} color={Palette.muted} />
                      </Pressable>
                    )}
                  </View>
                  <Text style={styles.noteBody}>{myNote.body}</Text>
                  {myNote.photoUrls.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.notePhotoStrip}>
                      {myNote.photoUrls.map((url, i) => (
                        <Image key={`${url}-${i}`} source={{ uri: url }} style={styles.notePhotoThumb} contentFit="cover" />
                      ))}
                    </ScrollView>
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
                      체크인 후 {WRITE_WINDOW_DAYS}일이 지나 수정할 수 없어요. 다시 방문해 체크인하면 또 남길 수 있어요.
                    </Text>
                  )}
                </View>
              )}

              {/* compose box — new note, or editing my existing one */}
              {canWrite && (!myNote || editing) && (
                <View style={styles.composeCard}>
                  <View style={styles.composeHead}>
                    <Text style={styles.composeTitle}>
                      {editing ? '메모 수정' : '이 도시 메모 남기기'}
                    </Text>
                  </View>
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
                    placeholder="이 도시에 뭐가 있는지, 어디가 좋았는지 추천해주세요"
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
                  <Text style={styles.lockedTitle}>
                    {elig?.lastVisitAt ? '작성 기간이 끝났어요' : '아직 메모를 남길 수 없어요'}
                  </Text>
                  <Text style={styles.lockedBody}>
                    {elig?.lastVisitAt
                      ? `체크인 후 ${WRITE_WINDOW_DAYS}일 동안만 작성할 수 있어요. 다시 방문해 체크인하면 또 남길 수 있어요.`
                      : `이 도시에 체크인하면 ${WRITE_WINDOW_DAYS}일 동안 메모를 남길 수 있어요.`}
                  </Text>
                </View>
              )}
            </>
          )}

          {/* everyone else's */}
          <View style={styles.notesList}>
            {otherNotes.map((n) => (
              <NoteRow key={n.id} note={n} />
            ))}
            {loaded && notes.length === 0 && (
              <Text style={styles.emptyNotes}>아직 이 도시의 메모가 없어요. 첫 메모를 남겨보세요.</Text>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function NoteRow({ note, mineLabel }: { note: CityNote; mineLabel?: boolean }) {
  return (
    <View style={styles.noteRow}>
      <View style={styles.noteHead}>
        <Text style={styles.author}>{mineLabel ? '나' : note.authorNickname}</Text>
        <Text style={styles.noteDate}>{relativeDate(note.createdAt)}</Text>
      </View>
      <Text style={styles.noteBody}>{note.body}</Text>
      {note.photoUrls.length === 1 && (
        <Image source={{ uri: note.photoUrls[0] }} style={styles.notePhoto} contentFit="cover" />
      )}
      {note.photoUrls.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.notePhotoStrip}>
          {note.photoUrls.map((url, i) => (
            <Image key={`${url}-${i}`} source={{ uri: url }} style={styles.notePhotoThumb} contentFit="cover" />
          ))}
        </ScrollView>
      )}
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
  notePhoto: { width: '100%', height: 200, borderRadius: 10, marginTop: 4, backgroundColor: Palette.surface },
  notePhotoStrip: { gap: Space.sm, marginTop: 4 },
  notePhotoThumb: { width: 150, height: 150, borderRadius: 10, backgroundColor: Palette.surface },
  emptyNotes: { color: Palette.muted, fontSize: 14, marginTop: Space.md, textAlign: 'center' },
});
