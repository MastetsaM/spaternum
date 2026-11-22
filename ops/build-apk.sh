#!/usr/bin/env bash
# Build a release APK of the current checkout and sign it with the Android debug key.
# Fine for personal testing, not for publishing. Same key every time, so it installs over the old app.
# Prints the path of the signed APK on the last line.
set -euo pipefail
cd "$(dirname "$0")/../src/client"

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[[ -n ${ANDROID_HOME:-} ]] || fail "ANDROID_HOME is not set."
BT=$ANDROID_HOME/build-tools/37.0.0
[[ -x $BT/apksigner ]] || fail "No build-tools 37.0.0 in $ANDROID_HOME."
[[ -f ~/.android/debug.keystore ]] || fail "No ~/.android/debug.keystore."

OUT=src-tauri/gen/android/app/build/outputs/apk/universal/release
NAME="spaternum-$(git symbolic-ref --short HEAD | tr / -)-$(git rev-parse --short HEAD)"
[[ -z $(git status --porcelain --untracked-files=no) ]] || NAME="$NAME-dirty"

pnpm tauri android build --apk --target aarch64 >&2
"$BT/zipalign" -f -p 4 "$OUT/app-universal-release-unsigned.apk" "$OUT/aligned.apk"
"$BT/apksigner" sign --ks ~/.android/debug.keystore --ks-pass pass:android \
  --ks-key-alias androiddebugkey --key-pass pass:android \
  --out "$OUT/$NAME.apk" "$OUT/aligned.apk" 2>/dev/null
"$BT/apksigner" verify "$OUT/$NAME.apk" 2>/dev/null

realpath "$OUT/$NAME.apk"
