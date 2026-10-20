# Clients: Tauri 2 + React for PC and Android

Decided 2026-10-17 in conversation with Mihail.

## Decision
PC and Android apps share one codebase: Tauri 2 with React + TypeScript. The PC app's code editor uses Monaco.

## Why
- One UI codebase for both platforms.
- PC app should feel like VS Code — Monaco is VS Code's editor.
- Lighter than Electron.

## Alternatives considered
- **Electron:** more mature, consistent rendering, but heavier and no Android.
- **Native Android app:** best device access, but a second codebase.
- **VS Code extension / Eclipse Theia:** less work for the editor, but limits the rest of the app.

## Consequences
- Easier: one UI, shared components.
- Harder: Tauri on Android is young (mic access to be proven in phase 0); Linux desktop uses WebKitGTK with possible quirks. Fallback for Android: PWA served by the server.

## Related
[[PRD]] · [[TECH]]
