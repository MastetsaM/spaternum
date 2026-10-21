# Tasks — Spaternum

## Before the first commit
- [x] Repo lives on **GitHub, public** (decided 2026-10-20)
- [x] License: **AGPL-3.0** ([[2026-10-20-license-agpl]])
- [x] `git init` in `projects/spaternum`, add `.gitignore` (node_modules, build output, `.env`) and `LICENSE` (AGPL-3.0 text), first commit on `main`
- [x] Create the public GitHub repo and push `main` (github.com/MastetsaM/spaternum)
- Workflow (ongoing): [[2026-10-20-git-workflow]]

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
- [x] Write `voice-notes_spec.md` → [[voice-notes_spec]], all questions answered; recording on Android only, PC views and listens. Inputs carried in:
  - Audio settings proven in phase 0: Opus/webm, 32 kbps, voice processing off, `RECORD_AUDIO` + `MODIFY_AUDIO_SETTINGS` ([[TECH]] Audio, [[voice-recorder-prototype_spec]])
  - Metadata syncs through RxDB; audio uploads separately ([[2026-10-21-sync-rxdb]])
  - Local audio: Android app storage; deleted only after upload + transcription + Mihail's transcript validation; app shows not-yet-uploaded recordings ([[2026-10-21-local-files-location]])
  - Archives server-only, shared Archive page, `list_archived()` / `restore()` ([[2026-10-20-architecture-modular-monolith]])
  - Use [[notes_spec]] as the model for structure
- [x] Phase 1 task list → below

## Phase 1 — notes + voice notes
Specs: [[notes_spec]], [[voice-notes_spec]]. One branch per block (name in brackets), merged when its tests pass ([[2026-10-20-git-workflow]]).

### Decided before starting (2026-10-21)
- [x] Folders: `src/server/` and `src/client/` (one client codebase for PC and Android)
- [x] Tests: server — pytest against a real Postgres in Docker; client — Vitest for logic, manual checks on the phone and PC for UI
- [x] Server URL + API token: a settings screen on first start, stored on the device, editable later in settings
- [x] Layout: Teams / VS Code style — a left rail with the main categories (Notes, Voice notes, Archive, later modules), a side panel with that category's sub-categories (e.g. the folder tree), the main content, and a panel on the other side for tool-specific settings/details
- [x] Phone layout: the left rail becomes a bottom tab bar, the sub-category panel slides in from the left, the tool panel opens from a button
- [x] Pi: deploy as early as possible (right after the server foundation). The Pi is updated **only from `main`, after the change is fully tested on the PC**. Day to day, the server runs on the PC and the phone reaches it over Tailscale (as in the sync spike)

### 1. Server foundation (`feature/server-skeleton`) — spec: [[server-foundation_spec]]
- [ ] uv project in `src/server/`, FastAPI app, `GET /health`, one folder per module
- [ ] Settings from `.env`: database URL, API token, data folder
- [ ] API token check on every route except `/health`
- [ ] `ops/docker-compose.yml` with the `db` service (Postgres + pgvector) for development
- [ ] Migration runner: numbered `.sql` files per module, applied in order, recorded in a `schema_migrations` table
- [ ] Sync helper: builds pull (by `seq`) and push (latest `updated_at` wins) endpoints for a table; `_deleted: true` ↔ `archived_at`; columns marked server-owned are never written by push
- [ ] SSE stream fed by Postgres `LISTEN/NOTIFY`, used as RxDB's pull stream
- [ ] Tests: migrations, token check, sync helper (conflict, late offline push, archive)

### 2. First deployment to the Pi (`feature/deploy`)
- [ ] Server Dockerfile, built for arm64 + amd64 with `docker buildx`
- [ ] `docker-compose.yml` with `api` + `db`, data folders as bind mounts on the HDD
- [ ] `install.sh`, `.env.example`, backup script (`pg_dump` + audio folder)
- [ ] Install on the Pi, reach `/health` over Tailscale from the phone and the PC
- [ ] Update steps for the Pi: pull `main` → rebuild → migrate → restart (only after PC testing)

### 3. Notes server (`feature/notes-server`)
- [ ] Migration: `note_folders`, `notes`, `seq` sequence, GIN index on tags
- [ ] Pull/push for folders and notes through the sync helper
- [ ] Archiving a folder archives everything inside with the same `archived_at`
- [ ] `list_archived()` and `restore(id)` — a folder restore brings back only what was archived with it
- [ ] Reject moving a folder into its own sub-folder
- [ ] Tests per the notes spec acceptance criteria (server side)

### 4. Voice notes server (`feature/voice-notes-server`)
- [ ] Migration: `voice_notes` (no path column; `uploaded_at` server-owned)
- [ ] Pull/push through the sync helper
- [ ] `PUT /voice-notes/{id}/audio`: temp file → size check → rename → set `uploaded_at` (new `seq`); repeat upload is a no-op; missing row → 404
- [ ] `GET /voice-notes/{id}/audio` for streaming (with seeking)
- [ ] `list_archived()` and `restore(id)`
- [ ] Tests: upload (size mismatch, repeat, missing row, interrupted), streaming, archive

### 5. Archive module, server (`feature/archive-server`)
- [ ] `GET /archive` (from each module's `list_archived()`, filter by type) and `POST /archive/{module}/{id}/restore`
- [ ] Tests

### 6. Client foundation (`feature/client-skeleton`)
- [ ] Scaffold `src/client/` (Tauri 2 + React + TS), Android init, manifest `RECORD_AUDIO` + `MODIFY_AUDIO_SETTINGS`, plugin-fs
- [ ] Client types generated from the server's OpenAPI with `openapi-typescript`
- [ ] First-start settings screen: server URL + API token, stored on the device, editable later
- [ ] RxDB opened once; replication helper (pull, push, SSE stream); clock offset from the `Date` header; online indicator from the last sync
- [ ] App shell: left rail (categories) → side panel (sub-categories) → main content → tool panel on the other side; on the phone: bottom tab bar, slide-in side panel, tool panel behind a button
- [ ] Release APK build and install on the phone (steps in [[TECH]])

### 7. Notes client (`feature/notes-client`)
- [ ] Folder tree: create, rename, move, archive
- [ ] Note list: first line as title, pinned first, then last edited
- [ ] Editor: plain text box; empty-note rules
- [ ] Tags, pin, move, archive
- [ ] Search: "contains" text + tag filter, offline
- [ ] Check every notes acceptance criterion on the phone and the PC

### 8. Voice notes client (`feature/voice-notes-client`)
- [ ] Recorder (Android only): settings from phase 0, audio appended to the file every ~5 s, row created at Stop, auto-continue at 1 hour
- [ ] Recovery of interrupted recordings on start
- [ ] Upload queue: after each recording, on start, when back online; show not-uploaded / error / audio-missing states
- [ ] List: title or date-time, tags, duration, size, upload state; tag filter; edit title and tags; archive
- [ ] Playback: local file, else stream; disabled with a reason when not possible
- [ ] PC: same list, no Record button
- [ ] Check every voice notes acceptance criterion on the phone and the PC

### 9. Archive page (`feature/archive-client`)
- [ ] Online-only page: everything archived, filter by type, Restore button

### 10. Phase 1 done
- [ ] Both specs' acceptance criteria checked on the PC server, then the Pi updated and checked again; results written in each spec

## Related
[[PRD]] · [[TECH]] · [[risks]] · [[notes_spec]] · [[voice-notes_spec]] · [[2026-10-21-sync-rxdb]] · [[2026-10-20-git-workflow]]
