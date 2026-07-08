/**
 * Pick or capture one photo for a check-in, downscaled before storage.
 *
 * Verified against Expo SDK 56 docs (2026-06-02):
 *  - expo-image-picker returns { canceled, assets: [{ uri }] }; mediaTypes is a
 *    string array (['images']); permissions via request*PermissionsAsync.
 *  - expo-image-manipulator uses the new context API: ImageManipulator.manipulate(uri)
 *    .resize({ width }) → renderAsync() → ImageRef.saveAsync({ compress, format }).
 *    (NOT the deprecated manipulateAsync.)
 *
 * Originals from a phone camera are multi-MB; we resize to a sane max width and
 * re-encode as JPEG so local storage and (later) upload stay cheap.
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Linking } from 'react-native';

const MAX_WIDTH = 1280;
const COMPRESS = 0.7;

/**
 * When a photo permission is denied the picker silently won't open, which reads
 * as a broken button. Tell the user why and offer a one-tap jump to the OS
 * settings for this app (the only place a previously-denied permission can be
 * re-granted).
 */
function showPermissionDeniedAlert(kind: 'library' | 'camera'): void {
  const what = kind === 'camera' ? '카메라' : '사진';
  Alert.alert(
    `${what} 접근 권한이 필요해요`,
    `설정에서 ${what} 접근을 허용하면 사진을 추가할 수 있어요.`,
    [
      { text: '취소', style: 'cancel' },
      { text: '설정 열기', onPress: () => Linking.openSettings() },
    ],
  );
}

async function downscale(uri: string): Promise<string> {
  const context = ImageManipulator.manipulate(uri);
  context.resize({ width: MAX_WIDTH }); // height auto to preserve aspect ratio
  const ref = await context.renderAsync();
  const result = await ref.saveAsync({ compress: COMPRESS, format: SaveFormat.JPEG });
  return result.uri;
}

/**
 * Pick one or more photos from the library. Returns resized local uris (empty if
 * cancelled/denied). Pass selectionLimit > 1 to allow multi-select (editing/crop
 * is disabled by the OS picker when multiple selection is on).
 */
export async function pickFromLibrary(selectionLimit = 1): Promise<string[]> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    showPermissionDeniedAlert('library');
    return [];
  }
  const multiple = selectionLimit !== 1;
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    allowsEditing: !multiple,
    allowsMultipleSelection: multiple,
    selectionLimit: multiple ? selectionLimit : undefined,
  });
  if (res.canceled || !res.assets?.length) return [];
  return Promise.all(res.assets.map((a) => downscale(a.uri)));
}

/** Capture a photo with the camera. Returns the resized local uri, or null. */
export async function takePhoto(): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    showPermissionDeniedAlert('camera');
    return null;
  }
  const res = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 1,
    allowsEditing: true,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  return downscale(res.assets[0].uri);
}
