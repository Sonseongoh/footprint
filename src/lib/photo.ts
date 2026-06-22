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

const MAX_WIDTH = 1280;
const COMPRESS = 0.7;

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
  if (!perm.granted) return [];
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
  if (!perm.granted) return null;
  const res = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 1,
    allowsEditing: true,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  return downscale(res.assets[0].uri);
}
