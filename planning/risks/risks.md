# Risks — Spaternum

## Microphone access in Tauri's Android webview
- **Likelihood:** medium · **Impact:** high
- Tauri on Android is younger than on desktop; the webview's mic permission request may not reach Android's runtime prompt.
- **Mitigation:** phase 0 prototype tests this first ([[voice-recorder-prototype_spec]]). Fallbacks: small native permission plugin, PWA served by the server, or a native recorder.

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

## Claude Code automation terms
- **Likelihood:** unknown · **Impact:** medium
- Calling Claude Code headless from the server on a Pro subscription may not be allowed.
- **Mitigation:** check Anthropic's terms before building on it; for now Claude Code runs interactively on the PC only.

## Related
[[PRD]] · [[TECH]] · [[tasks]]
