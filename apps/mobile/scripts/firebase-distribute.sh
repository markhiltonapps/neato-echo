#!/usr/bin/env bash
# Upload an APK to Firebase App Distribution and release it to the "testers" group.
#
# Auth: uses your gcloud user token (run `gcloud auth login` once as an owner/editor of the
# neato-echo project). No service-account key or firebase CLI required.
#
# Usage:
#   ./scripts/firebase-distribute.sh [path-to-apk] ["release notes"]
# Defaults to the standard release APK path and a generic note.
set -euo pipefail

PROJECT_ID="neato-echo"
PROJECT_NUMBER="69849647368"
APP_ID="1:69849647368:android:bb67ca442a3710513784bd"
GROUP="testers"
API="https://firebaseappdistribution.googleapis.com/v1"
UPLOAD_API="https://firebaseappdistribution.googleapis.com/upload/v1"

APK="${1:-android/app/build/outputs/apk/release/app-release.apk}"
NOTES="${2:-New Neato Echo Android beta build.}"

[ -f "$APK" ] || { echo "APK not found: $APK" >&2; exit 1; }

TOKEN="$(gcloud auth print-access-token)"
AUTH=(-H "Authorization: Bearer $TOKEN" -H "X-Goog-User-Project: $PROJECT_ID")

echo "Uploading $(du -h "$APK" | cut -f1) → App Distribution…"
OP=$(curl -s -X POST "${AUTH[@]}" \
  -H "X-Goog-Upload-Protocol: raw" -H "X-Goog-Upload-File-Name: Neato-Echo.apk" \
  -H "Content-Type: application/octet-stream" --data-binary @"$APK" \
  "$UPLOAD_API/projects/$PROJECT_NUMBER/apps/$APP_ID/releases:upload" \
  | grep -oE '"name": *"[^"]+"' | head -1 | sed -E 's/.*"name": *"([^"]+)".*/\1/')
[ -n "$OP" ] || { echo "Upload failed (no operation returned)." >&2; exit 1; }

echo "Processing…"
REL=""
for _ in $(seq 1 24); do
  RESP=$(curl -s "${AUTH[@]}" "$API/$OP")
  if echo "$RESP" | grep -q '"done": *true'; then
    REL=$(echo "$RESP" | grep -oE "projects/[0-9]+/apps/[^\"/]+/releases/[A-Za-z0-9]+" | grep -v '/operations' | head -1)
    break
  fi
  sleep 5
done
[ -n "$REL" ] || { echo "Timed out waiting for the release to process." >&2; exit 1; }
echo "Release: $REL"

# Release notes (JSON-escaped) then distribute to the tester group.
NOTES_JSON=$(printf '%s' "$NOTES" | python -c 'import json,sys; print(json.dumps(sys.stdin.read()))')
curl -s -X PATCH "${AUTH[@]}" -H "Content-Type: application/json" \
  "$API/$REL?updateMask=releaseNotes.text" \
  -d "{\"releaseNotes\":{\"text\":$NOTES_JSON}}" >/dev/null
curl -s -X POST "${AUTH[@]}" -H "Content-Type: application/json" \
  "$API/$REL:distribute" -d "{\"groupAliases\":[\"$GROUP\"]}" >/dev/null

echo "✓ Distributed to '$GROUP'. Testers get an email + it appears in their App Tester app."
