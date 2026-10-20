# Spec — Voice recorder prototype (phase 0)

## What and why
A throwaway Tauri 2 app that records microphone audio on the Xiaomi 14T, saves it locally and plays it back. It exists to prove the riskiest part of the stack — microphone access inside Tauri's Android webview — before anything is built around it. Its code is not reused in the real app.

Location: `projects/spaternum/src/prototypes/voice-recorder/`.

## Inputs and outputs
- **Input:** microphone audio; taps on Record / Stop / Play / Delete.
- **Output:** Opus audio files in the app's private data folder; a list of saved recordings with date, duration and file size; audio playback.

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
7. Findings are written down in the Results section below.

## Edge cases and failure modes to test
- Permission denied → the app shows a clear message, doesn't crash.
- Permission denied once, then allowed from Android settings → recording works.
- App sent to background mid-recording → note what happens (stops? continues? corrupts the file?). Behaviour is recorded, not fixed, in the prototype.
- Phone call arrives mid-recording → note what happens.
- `audio/webm;codecs=opus` not supported by the webview → try `audio/ogg;codecs=opus`, note which works.

## Out of scope
- Server, upload, sync, outbox.
- Text notes.
- Desktop build (Linux build may happen anyway; not tested).
- Second Space install.
- Styling beyond usable.
- Transcription.

## Open questions
- Does Tauri 2 forward the webview's microphone permission request to Android out of the box, or does it need a small native plugin? The prototype answers this.
- If mic access fails and can't be fixed cheaply: fall back to a PWA served by the server, or a small native recorder. Decision to be made with Mihail then.

## Results
_To be filled in after testing._

## Related
[[PRD]] · [[TECH]] · [[tasks]] · [[risks]]
