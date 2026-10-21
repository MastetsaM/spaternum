# CONTEXT — src

Application code. So far only throwaway prototypes: `prototypes/voice-recorder/` (phase 0, done) and `prototypes/sync-spike/` (done). Next: phase 1 — `server/` and `client/`.

## Planned layout
| Path | Contents |
|---|---|
| `prototypes/` | Throwaway experiments. Not reused in the real app. First: `voice-recorder/` ([[voice-recorder-prototype_spec]]) |
| `server/` | FastAPI app, one folder per module (phase 1) |
| `client/` | Tauri 2 + React app for PC and Android (phase 1) |

Folder names confirmed 2026-10-21. `client/` is one codebase for both PC and Android.

## Rules for code here
- Follow the patterns in [[TECH]]: modules don't reach into each other's internals; client types are generated from OpenAPI, never hand-written; UI code never calls `fs` directly.
- Package manager for the clients is **pnpm** (see `planning/decisions/2026-10-20-package-manager-pnpm.md`).
- Every installed package is logged in `wiki/installed.md` and its exact version pinned in [[TECH]].
- Tests: `feature-name_test.*`.

## Related
[[CLAUDE]] · [[TECH]] · [[tasks]]
