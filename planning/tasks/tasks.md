# Tasks — Spaternum

## Before the first commit
- [x] Repo lives on **GitHub, public** (decided 2026-10-20)
- [x] License: **AGPL-3.0** ([[2026-10-20-license-agpl]])
- [x] `git init` in `projects/spaternum`, add `.gitignore` (node_modules, build output, `.env`) and `LICENSE` (AGPL-3.0 text), first commit on `main`
- [x] Create the public GitHub repo and push `main` (github.com/MastetsaM/spaternum)
- [ ] Workflow: [[2026-10-20-git-workflow]]

## Phase 0 — voice recorder prototype
- [x] Install Tauri Linux prerequisites, Rust, Android target; set Android env vars ([[TECH]])
- [x] Connect phone with USB debugging (main space)
- [x] Document the project: PRD, TECH, decisions, risks, prototype spec
- [x] Scaffold `src/prototypes/voice-recorder` with create-tauri-app (React + TS)
- [x] `pnpm tauri android init`; add `RECORD_AUDIO` to the Android manifest
- [x] Build the single screen: Record / Stop / list / Play / Delete
- [x] Save recordings with `@tauri-apps/plugin-fs` to app storage
- [x] Run on the phone — done with a signed release APK sent to the phone instead of `pnpm tauri android dev`
- [x] Test against the acceptance criteria and edge cases in [[voice-recorder-prototype_spec]]
- [x] Write results in the spec; decide go / fallback with Mihail → **go** ([[2026-10-20-prototype-go-tauri-android]])
- [x] Log every installed package in `wiki/installed.md`; pin exact versions in [[TECH]]

## Before phase 1 (decisions needed)
- [x] ORM (SQLAlchemy + Alembic) vs plain SQL with psycopg → plain SQL ([[2026-10-21-database-access-plain-sql]])
- [x] Notes data model → [[notes_spec]] (folders any depth, first line = title, Markdown, `text[]` tags, pinned, archive, offline)
- [x] Offline for notes too → yes ([[2026-10-20-offline-latest-write-wins]])
- [x] Sync approach → RxDB + pull/push endpoints, confirmed by the spike ([[2026-10-21-sync-rxdb]])
- [x] Cross-module data rules → read via public functions, IDs only, no cross-module foreign keys ([[2026-10-20-architecture-modular-monolith]])
- [x] Write `notes_spec.md`
- [x] **Sync spike** → passed, RxDB confirmed — spec and results: [[sync-spike_spec]] (throwaway, `src/prototypes/sync-spike`): one RxDB collection in the Tauri app + pull/push endpoints in FastAPI + Postgres. Test: offline edit on the phone → back online → reaches the PC. Also check IndexedDB persistence on Android and the RxDB license file.
- [x] Answer the open questions in [[notes_spec]] → all decided; archives live only on the server, one shared Archive page
- [x] Decide where local files live → Android app storage, PC `~/Documents/Spaternum/` ([[2026-10-21-local-files-location]])
- [ ] Write `voice-notes_spec.md`

## Related
[[PRD]] · [[TECH]] · [[risks]] · [[notes_spec]] · [[2026-10-21-sync-rxdb]]
