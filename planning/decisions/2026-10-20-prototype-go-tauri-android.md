# Phase 0 result: go with Tauri on Android

Decided 2026-10-20 with Mihail, after testing the voice recorder prototype on the Xiaomi 14T.

## Decision
Keep Tauri 2 for the Android client ([[2026-10-20-clients-tauri-react]]). The PWA fallback is not needed. Phase 0 is closed.

## Why
The risk phase 0 existed for — mic access inside Tauri's Android webview — is resolved. Results in [[voice-recorder-prototype_spec]]:
- Mic permission prompt and recording work, once the manifest declares both `RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS`.
- Recording continues in the background, with the screen off, and through a phone call (silent while the call has the mic).
- Denying and re-allowing the permission is handled without crashes.
- `audio/webm;codecs=opus` at 32 kbps with voice processing off gives clear speech at ~200–250 KB/min.

## Alternatives considered
- **PWA served by the server:** no install needed, but would need the server running before anything else could be built, and background recording in a browser tab is less reliable. Not needed since Tauri works.
- **Native Android recorder:** most control, but a second codebase and language. Not needed.

## Consequences
- Easier: phase 1 can build the real client on one codebase for PC and Android.
- Carry into phase 1: the two manifest permissions, the `getUserMedia` settings, and the 32 kbps bitrate.
- Still open for phase 1: where local files live on Android — direct writes to `Documents/` are blocked by scoped storage (options listed in the spec's Results).

## Related
[[2026-10-20-clients-tauri-react]] · [[voice-recorder-prototype_spec]] · [[risks]] · [[tasks]] · [[PRD]]
