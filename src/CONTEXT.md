# CONTEXT — src

Application code. Nothing here yet — phase 0 starts with the prototype.

## Planned layout
| Path | Contents |
|---|---|
| `prototypes/` | Throwaway experiments. Not reused in the real app. First: `voice-recorder/` ([[voice-recorder-prototype_spec]]) |
| `server/` | FastAPI app, one folder per module (phase 1) |
| `client/` | Tauri 2 + React app for PC and Android (phase 1) |

Folder names for `server/` and `client/` are a proposal — confirm with Mihail when phase 1 starts.

## Rules for code here
- Follow the patterns in [[TECH]]: modules don't reach into each other's internals; client types are generated from OpenAPI, never hand-written; UI code never calls `fs` directly.
- Package manager for the clients is **pnpm** (see `planning/decisions/2026-10-20-package-manager-pnpm.md`).
- Every installed package is logged in `wiki/installed.md` and its exact version pinned in [[TECH]].
- Tests: `feature-name_test.*`.

## Related
[[CLAUDE]] · [[TECH]] · [[tasks]]
