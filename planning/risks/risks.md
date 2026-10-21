# Risks — Spaternum

## Microphone access in Tauri's Android webview
- **Likelihood:** medium · **Impact:** high
- Tauri on Android is younger than on desktop; the webview's mic permission request may not reach Android's runtime prompt.
- **Mitigation:** phase 0 prototype tests this first ([[voice-recorder-prototype_spec]]). Fallbacks: small native permission plugin, PWA served by the server, or a native recorder.
- **Status (2026-10-20): resolved** — works once the manifest declares `RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS` ([[2026-10-20-prototype-go-tauri-android]]).

## Scope creep
- **Likelihood:** high · **Impact:** high
- A "whole workspace" project can stall on endless modules and never ship.
- **Mitigation:** one module end to end before starting the next; phases in [[PRD]].

## Pi performance for AI work
- **Likelihood:** high · **Impact:** medium
- No GPU; embeddings and transcription will be slow.
- **Mitigation:** run them as background jobs; move heavy AI to the home server.

## WebKitGTK quirks on the Linux desktop
- **Likelihood:** medium · **Impact:** low
- Tauri uses the system webview; Monaco or layout may render slightly differently.
- **Mitigation:** test early in the desktop phase; Electron remains a fallback for desktop only.

## Gradle / JDK compatibility
- **Likelihood:** low (mitigated) · **Impact:** medium
- System JDK 27 is likely too new for Tauri's Gradle.
- **Mitigation:** `JAVA_HOME` points to Android Studio's JDK 21 ([[TECH]]).

## Offline conflicts
- **Likelihood:** low · **Impact:** low
- Latest-write-wins can drop an edit made on two devices at once.
- **Mitigation:** single user; acceptable. Revisit only if it bites.

## RxDB in Tauri's webview (sync)
- **Likelihood:** medium · **Impact:** high
- Not yet tested in Tauri on Android or WebKitGTK; IndexedDB persistence in the Android webview unverified; licensing claims come mostly from RxDB's own site.
- **Mitigation:** sync spike before phase 1 ([[2026-10-21-sync-rxdb]]). Fallback: own sync (SQLite via Tauri + outbox) behind the same pull/push endpoints — server side stays the same.
- **Status (2026-10-21): resolved** — spike passed on PC and phone ([[sync-spike_spec]]).

## Local files on Android
- **Likelihood:** high (confirmed) · **Impact:** low
- Direct path writes to shared storage (`Documents/`) are blocked by scoped storage; files in app storage are deleted on uninstall.
- **Mitigation:** server is the source of truth, so app storage is only a cache. Decide before voice notes: app storage only, "All files access", Storage Access Framework, or MediaStore ([[voice-recorder-prototype_spec]] Results).
- **Status (2026-10-21): decided** — app storage on Android, `~/Documents/Spaternum` on the PC; the app shows which recordings aren't uploaded yet ([[2026-10-21-local-files-location]]).

## Claude Code automation terms
- **Likelihood:** unknown · **Impact:** medium
- Calling Claude Code headless from the server on a Pro subscription may not be allowed.
- **Mitigation:** check Anthropic's terms before building on it; for now Claude Code runs interactively on the PC only.

## Related
[[PRD]] · [[TECH]] · [[tasks]]
