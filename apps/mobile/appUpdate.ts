import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import { Platform } from "react-native";

// In-app APK self-update for sideloaded Android builds (there is no Play Store auto-update).
// Downloads the latest release APK and hands it to Android's package installer, so the user
// gets a one-tap "Update" like the Windows app instead of a browser download they have to
// find and open by hand. Android still shows its own install confirmation — and, the first
// time, a one-off "allow installs from this source" screen (the REQUEST_INSTALL_PACKAGES
// permission in AndroidManifest lets that prompt appear). iOS has no sideload path, so the
// caller falls back to opening the URL in the browser there.

// FLAG_GRANT_READ_URI_PERMISSION — lets the installer read the content:// URI we pass it.
const FLAG_GRANT_READ_URI_PERMISSION = 1;
const APK_MIME = "application/vnd.android.package-archive";

export function canInstallInApp(): boolean {
  return Platform.OS === "android";
}

// Download `url` to the app cache and launch the system installer. Resolves once the
// installer intent has been launched (not when the install completes — that's the user's
// confirmation in the OS UI). Throws on any failure so the caller can fall back to opening
// the URL in a browser; the partial download is cleaned up first.
export async function downloadAndInstallApk(
  url: string,
  onProgress?: (fraction: number) => void
): Promise<void> {
  if (!canInstallInApp()) throw new Error("In-app install is Android-only");

  const target = (FileSystem.cacheDirectory || "") + "neato-echo-update.apk";
  // Always start clean — a stale partial from a cancelled run could install a corrupt APK.
  try {
    await FileSystem.deleteAsync(target, { idempotent: true });
  } catch {
    // nothing to delete / not writable — downloadAsync below will surface a real error
  }

  const task = FileSystem.createDownloadResumable(url, target, {}, (p) => {
    if (onProgress && p.totalBytesExpectedToWrite > 0) {
      onProgress(p.totalBytesWritten / p.totalBytesExpectedToWrite);
    }
  });

  let fileUri: string | undefined;
  try {
    const res = await task.downloadAsync();
    fileUri = res?.uri;
  } catch (e) {
    try {
      await FileSystem.deleteAsync(target, { idempotent: true });
    } catch {
      // best-effort cleanup
    }
    throw e;
  }
  if (!fileUri) throw new Error("APK download failed");

  // Android 7+ refuses file:// URIs across apps; hand the installer a content:// URI.
  const contentUri = await FileSystem.getContentUriAsync(fileUri);
  await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
    data: contentUri,
    flags: FLAG_GRANT_READ_URI_PERMISSION,
    type: APK_MIME,
  });
}
