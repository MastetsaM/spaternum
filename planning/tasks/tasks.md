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

**Status 2026-10-28 (end of day):**
- Blocks 1–9 are done and merged into `main`. Blocks 7–9 were built in parallel, each by its own agent on its own branch, then combined on `feature/phase1-client`. Mihail checked them on the phone and the PC against the Pi, and the branch was merged.
- Also built during the checks, from Mihail's feedback:
  - an optional note title (server migration 002)
  - folders browsed like a file manager
  - the voice-notes player
  - resizable PC panels down to icons only ([[ui-design_spec]])
  - per-device favorite tools ([[favorites_spec]])
- Results are written in each spec. Code map: `src/CONTEXT.md`.

### Decided before starting (2026-10-21)
- [x] Folders: `src/server/` and `src/client/` (one client codebase for PC and Android)
- [x] Tests: server — pytest against a real Postgres in Docker; client — Vitest for logic, manual checks on the phone and PC for UI
- [x] Server URL + API token: a settings screen on first start, stored on the device, editable later in settings
- [x] Layout: Teams / VS Code style — left rail / bottom bar with the sections (Home, Tools, Clients, Projects; Settings as a gear on Home only, since 2026-10-28), side panel / ☰ drawer with the tools (Notes, Voice notes, Archive) and the open tool's items (e.g. folders), main content, tool panel on the right ([[client-foundation_spec]], corrected 2026-10-26)
- [x] Phone layout: the sections go in the bottom bar, the tools in the ☰ drawer, the tool panel opens from a button
- [x] Pi: deploy as early as possible (right after the server foundation). The Pi is updated **only from `main`, after the change is fully tested on the PC**. Day to day, the server runs on the PC and the phone reaches it over Tailscale (as in the sync spike)

### 1. Server foundation (`feature/server-skeleton`) — spec: [[server-foundation_spec]]
- [x] uv project in `src/server/`, FastAPI app, `GET /health`, one folder per module
- [x] Settings from `.env`: database URL, API token, data folder
- [x] API token check on every route except `/health`
- [x] `ops/docker-compose.yml` with the `db` service (Postgres + pgvector) for development
- [x] Migration runner: numbered `.sql` files per module, applied in order, recorded in a `schema_migrations` table
- [x] Sync helper: builds pull (by `seq`) and push (latest `updated_at` wins) endpoints for a table; `_deleted: true` ↔ `archived_at`; columns marked server-owned are never written by push
- [x] SSE stream fed by Postgres `LISTEN/NOTIFY`, used as RxDB's pull stream
- [x] Plain-text logging to stdout
- [x] Tests: migrations, token check, sync helper (conflict, late offline push, archive)

### 2. First deployment to the Pi (`feature/deploy`) — spec: [[deploy_spec]]
- [x] Server Dockerfile, built on the machine that runs it (no `buildx`, no registry)
- [x] `docker-compose.yml` with `api` + `db`, data folders as bind mounts on the HDD
- [x] `install.sh`, `.env.example`, backup script (`pg_dump` + audio folder) — tested on the PC
- [x] Install on the Pi, reach `/health` over Tailscale from the phone and the PC (2026-10-25; API on port 8001, `tailscale serve --bg 8001`)
- [x] Update steps for the Pi: `update.sh` — pull `main` → rebuild → migrate → restart (only after PC testing)

### 3. Notes server (`feature/notes-server`)
- [x] Migration: `note_folders`, `notes`, `seq` sequence, GIN index on tags (no foreign keys)
- [x] Pull/push for folders and notes through the sync helper
- [x] Archiving a folder archives everything inside with the same `archived_at`
- [x] `list_archived()` and `restore(id)` — a folder restore brings back only what was archived with it
- [x] Reject moving a folder into its own sub-folder
- [x] Tests per the notes spec acceptance criteria (server side)

### 4. Voice notes server (`feature/voice-notes-server`)
- [x] Migration: `voice_notes` (no path column; `uploaded_at` server-owned)
- [x] Pull/push through the sync helper
- [x] `PUT /voice-notes/{id}/audio`: temp file → size check → rename → set `uploaded_at` (new `seq`); repeat upload is a no-op; missing row → 404
- [x] `GET /voice-notes/{id}/audio` for streaming (with seeking)
- [x] `list_archived()` and `restore(id)`
- [x] Tests: upload (size mismatch, repeat, missing row, interrupted), streaming, archive

### 5. Archive module, server (`feature/archive-server`) — spec: [[archive_spec]]
- [x] `GET /archive` (from each module's `list_archived()`, filter by type) and `POST /archive/{module}/{id}/restore`
- [x] Tests

### 6. Client foundation (`feature/client-skeleton`) — spec: [[client-foundation_spec]]
- [x] Scaffold `src/client/` (Tauri 2 + React + TS), Android init, manifest `RECORD_AUDIO` + `MODIFY_AUDIO_SETTINGS`, plugin-fs
- [x] Client types generated from the server's OpenAPI with `openapi-typescript`
- [x] First-start settings screen: server URL + API token, stored on the device, editable later
- [x] RxDB opened once; replication helper (pull, push, SSE stream); clock offset from the `Date` header; online indicator from the last sync
- [x] App shell: rail / bottom bar (sections) → side panel / ☰ drawer (tools + the open tool's items) → main content → tool panel
- [x] Release APK build and install on the phone (steps in [[TECH]])

### 7. Notes client (`feature/notes-client`)
- [x] Folder tree: create, rename, move, archive
- [x] Note list: first line as title, pinned first, then last edited
- [x] Editor: plain text box; empty-note rules
- [x] Tags, pin, move, archive
- [x] Search: "contains" text + tag filter, offline
- [x] Check every notes acceptance criterion on the phone and the PC (2026-10-28; criterion 6 not checked separately, results in [[notes_spec]])
- [x] Moved from block 6: live sync seen on the PC; offline writes kept and synced back (client-foundation criteria 4–5)

### 8. Voice notes client (`feature/voice-notes-client`)
- [x] Recorder (Android only): settings from phase 0, audio appended to the file every ~5 s, row created at Stop, auto-continue at 1 hour
- [x] Recovery of interrupted recordings on start
- [x] Upload queue: after each recording, on start, when back online; show not-uploaded / error / audio-missing states
- [x] List: title or date-time, tags, duration, size, upload state; tag filter; edit title and tags; archive
- [x] Playback: local file, else stream; disabled with a reason when not possible
- [x] PC: same list, no Record button
- [x] Check every voice notes acceptance criterion on the phone and the PC (2026-10-28; 6 and 7 not checked on the device, results in [[voice-notes_spec]])

### 9. Archive page (`feature/archive-client`)
- [x] Online-only page: everything archived, filter by type, Restore button ([[archive_spec]] client page)
- [x] Check the archive client criteria (6–8) on the phone and the PC (2026-10-28; 8 not checked separately)

### 10. Phase 1 done
- [x] Acceptance criteria checked and results written in each spec. The device checks ran directly against the Pi, which already had every server change from `main`.
- [x] Install the latest APK on the phone and check ★ Favorites (2026-10-28, works on the PC and the phone)
- [x] Pi updated to `main` with `ops/update.sh` (2026-10-28, Mihail). No new migrations.
- [x] Last device checks (2026-10-29): two devices editing the same note, killing the app during an upload, and the Archive page's offline message with Retry. Results are in [[notes_spec]], [[voice-notes_spec]] and [[archive_spec]].

## Next: calendar
Moved ahead of notes with recordings because it's more urgent (Mihail, 2026-10-29). Spec: [[calendar_spec]]. Library choice: [[2026-10-29-calendar-fullcalendar]].
- [x] Answer the open questions in [[calendar_spec]] (2026-10-29)

### C1. Calendar server (`feature/calendar-server`)
- [x] Migration: `calendar_events` with `seq` and the sync trigger (no foreign keys)
- [x] Pull/push through the sync helper (end before start is refused in the app's form, not by the server — same as empty notes)
- [x] Archiving a series archives its exceptions with the same `archived_at`; restore brings back only those
- [x] `list_archived()` and `restore(id)`; one Archive entry per series
- [x] Tests (calendar criteria 7–10, server side)
- [x] Archived rows are locked until restored (Mihail, 2026-10-29)

### C2. Calendar client (`feature/calendar-client`)
- [x] Install `@fullcalendar/react`, `temporal-polyfill`, `rrule-temporal`; log them in `wiki/installed.md`, pin versions in [[TECH]]
- [x] RxDB collection `calendar_events` + replication; regenerate client types
- [x] Occurrence expansion for the dates on screen (rrule-temporal, in the event's time zone, exceptions applied); Vitest incl. the DST case
- [x] Calendar tool in the side panel: year (dots), month, week, day; Today and arrows; 15/30-minute switch and last view saved per device; Monday start; 24 h scrolled to 08:00
- [x] Create by click/drag (PC) and long-press (phone), 30 minutes by default; move and resize
- [x] Event form: title, all-day, start, end, repeat, notes; saves on its own; end before start refused
- [x] Only this one / This and following / All, for editing and archiving; Vitest for the three modes
- [x] Archive page shows calendar events
- [~] Check every calendar acceptance criterion on the phone and the PC; write results in [[calendar_spec]]

## Later (ideas and loose ends, not scheduled)
- **Notes with recordings:** merge notes and voice notes into one note with text and/or recordings, plus a Pinned section, folder tags, a full tree and notes settings in the tool panel. Draft with Mihail's decisions: [[notes-recordings_spec]]. Next after the calendar.
- **Claude talking to the server directly (MCP-like):** let Claude read and create notes (and later other items) on Mihail's server, e.g. "make a note about this". Asked for on 2026-10-28; needs a spec first, covering what it may do, the token, and Tailscale-only access ([[2026-10-20-auth-tailscale-api-token]]).
- **Tool groups on the Tools page:** Android-style folders to sort tools by use, **synced across devices**. Dropped for now as too much work (Mihail, 2026-10-28).
- **Updates for other users:** only when someone else wants to use the app. Publish builds to GitHub Releases, use the Tauri updater on the PC and Obtainium on Android, sign with one fixed release key (not the debug key), and have the app warn when the server is older than the app (Mihail, 2026-10-29).
- **Drag and drop:** for reordering favorites (arrows for now), and for groups if they come.
- **Notes order:** pin, tag and move change `updated_at`, so the note jumps up the list. Fixing it needs a separate edited time ([[notes_spec]]).
- **Name of the first section, Home or Dashboard:** still open in [[ui-design_spec]]. Home is kept for now.
- **Housekeeping:**
  - the Starlette `httpx` deprecation warning in server tests
  - the client bundle is over 500 kB (Vite warning)
  - Archive page offline: it waits until the request gives up before showing "needs the server". A short time limit would show it sooner.
  - the old `spike-db` container can be removed
  - a real PC install (Arch package depending on `gst-plugins-good`, or an AppImage) instead of `pnpm tauri dev`

## Related
[[PRD]] · [[TECH]] · [[risks]] · [[notes_spec]] · [[voice-notes_spec]] · [[archive_spec]] · [[client-foundation_spec]] · [[ui-design_spec]] · [[favorites_spec]] · [[notes-recordings_spec]] · [[calendar_spec]] · [[2026-10-21-sync-rxdb]] · [[2026-10-20-git-workflow]]
