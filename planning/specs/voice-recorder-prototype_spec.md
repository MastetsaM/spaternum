# Spec — Voice recorder prototype (phase 0)

## What and why
A throwaway Tauri 2 app that records microphone audio on the Xiaomi 14T, saves it locally and plays it back. It exists to prove the riskiest part of the stack — microphone access inside Tauri's Android webview — before anything is built around it. Its code is not reused in the real app.

Location: `projects/spaternum/src/prototypes/voice-recorder/`.

## Inputs and outputs
- **Input:** microphone audio; taps on Record / Stop / Play / Delete.
- **Output:** Opus audio files in the app's private data folder, plus a test copy of each in `Documents/Spaternum/` on the phone's shared storage; a list of saved recordings with date, duration and file size; audio playback.

## UI
One screen:
- **Record / Stop** button, with a running timer while recording.
- **List of recordings** (newest first): date-time, duration, size, **Play** and **Delete**.

## Acceptance criteria (done when…)
1. The app installs and opens on the phone via `pnpm tauri android dev`.
2. On first Record, Android asks for microphone permission; after allowing, recording starts.
3. A 1-minute recording saves as an Opus file and plays back clearly.
4. Recordings are still listed and playable after closing and reopening the app.
5. File size is noted — expected around 0.1 MB per minute of speech.
6. Recording keeps working with the screen on for at least 5 minutes.
7. Writing a copy to `Documents/Spaternum/` is tried for every recording; whether it worked (and whether the file shows in the phone's file manager) is noted. Failure here doesn't fail the prototype — it answers where phase 1 can keep local files.
8. Findings are written down in the Results section below.

## Edge cases and failure modes to test
- Permission denied → the app shows a clear message, doesn't crash.
- Permission denied once, then allowed from Android settings → recording works.
- App sent to background mid-recording → note what happens (stops? continues? corrupts the file?). Behaviour is recorded, not fixed, in the prototype.
- Phone call arrives mid-recording → note what happens.
- `audio/webm;codecs=opus` not supported by the webview → try `audio/ogg;codecs=opus`, note which works.

## Out of scope
- Server, upload, sync, outbox.
- Text notes.
- Desktop build (Linux build may happen anyway; not tested). The PC `Documents/Spaternum` location is a phase 1 question.
- Second Space install.
- Styling beyond usable.
- Transcription.

## Open questions
- Does Tauri 2 forward the webview's microphone permission request to Android out of the box, or does it need a small native plugin? The prototype answers this.
- If mic access fails and can't be fixed cheaply: fall back to a PWA served by the server, or a small native recorder. Decision to be made with Mihail then.

## Results
Tested 2026-10-20 on the Xiaomi 14T (Android 16), release APK signed with the debug key, installed by tapping the file.

| # | Criterion | Result |
|---|---|---|
| 1 | Installs and opens | ✅ (installed from APK, not `tauri android dev`) |
| 2 | Mic permission prompt, then recording | ✅ — after adding `MODIFY_AUDIO_SETTINGS` (see below) |
| 3 | 1-minute recording plays back clearly | ⚠️ Plays, but not very clear |
| 4 | Persists after reopening | ✅ |
| 5 | File size | ⚠️ 1004 KB for 1:04 (~940 KB/min, ~125 kbps) — about 10× the expected 0.1 MB/min. No bitrate was set, so this is the webview default |
| 6 | 5 minutes of recording | ✅ Kept recording even after the screen turned off |
| 7 | `Documents/Spaternum` copy | ❌ `failed to create directory at path: /storage/emulated/0/Documents/Spaternum with error: Permission denied (os error 13)` — Android's scoped storage blocks direct path writes there |

**Format:** `audio/webm;codecs=opus` is supported; the ogg fallback isn't needed.

**Edge cases:**
- App in background mid-recording → keeps recording.
- Phone call mid-recording → doesn't record during the call.
- Permission denied, then allowed from settings → not tested yet.

**Findings:**
- Tauri forwards the webview's mic request to Android out of the box, but its `RustWebChromeClient` asks for **both** `RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS`. With only `RECORD_AUDIO` in the manifest, `getUserMedia` fails with `NotAllowedError: Permission denied` and no prompt.
- Writing to shared storage by path doesn't work without extra permission. Options for phase 1: "All files access" (`MANAGE_EXTERNAL_STORAGE`), the Storage Access Framework (user picks the folder), or MediaStore.
- Unclear audio is likely the webview's default voice processing (echo cancellation, noise suppression, auto gain) — not yet confirmed.
- A debug APK is ~134 MB; a release APK is ~6.5 MB.

## Related
[[PRD]] · [[TECH]] · [[tasks]] · [[risks]]
