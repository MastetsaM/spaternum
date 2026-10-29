# CONTEXT — src

Application code, and the map of what lives where. Read the first comment of each file for its job; this page shows how the files fit together.

**Status (2026-10-28):**
- `server/` is done and running on the Pi. It covers the foundation, `notes/`, `voice_notes/` and `archive/` ([[server-foundation_spec]], [[notes_spec]], [[voice-notes_spec]], [[archive_spec]]).
- `client/`: phase 1 is done and on `main`: the foundation, Notes, Voice notes, Archive, resizable PC panels and favorite tools ([[client-foundation_spec]], [[ui-design_spec]], [[favorites_spec]]). The PC app runs with `pnpm tauri dev` and needs `gst-plugins-good` for audio ([[TECH]]).
- Next: [[calendar_spec]] (draft), then [[notes-recordings_spec]] (draft). Other ideas are in [[tasks]] under "Later".

## Folders
| Path | Contents |
|---|---|
| `server/` | FastAPI app, one folder per module |
| `client/` | Tauri 2 + React app, one codebase for PC and Android |
| `prototypes/` | Throwaway experiments, not reused: `voice-recorder/` ([[voice-recorder-prototype_spec]]), `sync-spike/` ([[sync-spike_spec]]) |

## How data moves
1. **Write:**
   - A screen writes to the local database (RxDB) through a module's store (`notes/store.ts`, `voice-notes/rows.ts`).
   - Every write sets `updated_at` from the server-corrected clock (`sync/clock.ts`).
2. **Push:**
   - `sync/db.ts` replicates each collection to `POST /api/<module>/<table>/push`.
   - The server keeps the newer `updated_at` (`server/spaternum/sync.py`).
   - Archiving is a push with `_deleted: true`; the server sets `archived_at` and keeps the row.
3. **Notify:**
   - A Postgres trigger (`core/migrations/001_sync.sql`) sends the table name on the `sync` channel.
   - `events.py` forwards it over SSE (`/api/events`).
   - `sync/events.ts` hears it and `sync/db.ts` pulls.
4. **Pull:** `GET /api/<module>/<table>/pull?seq=` returns rows changed after the device's last `seq`. Archived rows come back as deletions, so they leave every device.
5. **Audio (voice notes only):**
   - The file is uploaded separately with `PUT /api/voice-notes/{id}/audio` (`voice_notes/audio.py`).
   - The server then sets `uploaded_at`, which syncs back like any change.
   - Any device can stream the file from `GET` on the same path.
6. **Archive page:** it calls `GET /api/archive` and `POST /api/archive/{module}/{id}/restore` directly, online only. A restore bumps `updated_at`, so the row syncs back to every device.

## Server — `server/`
Run, migrate and test commands are at the top of `spaternum/main.py`, `spaternum/migrate.py` and `tests/conftest.py`.

| File | What it does |
|---|---|
| `spaternum/main.py` | Builds the app: routers, `/health`, CORS, the 503 handler for "database down" |
| `spaternum/config.py` | Settings from environment variables (`DATABASE_URL`, `API_TOKEN`, `DATA_DIR`, `LOG_LEVEL`) |
| `spaternum/db.py` | Postgres connection pool; `get_conn` for routes |
| `spaternum/auth.py` | `require_token`: the Bearer token check on every `/api` route |
| `spaternum/logs.py` | Plain-text logs to stdout, one line per request |
| `spaternum/migrate.py` | Applies `<module>/migrations/NNN_*.sql` in order, each once |
| `spaternum/sync.py` | The reusable pull/push helper; one `SyncTable` per synced table, with optional reject and on-archive hooks |
| `spaternum/events.py` | The SSE stream: `LISTEN sync`, keepalive every 25 s |
| `spaternum/core/migrations/` | `sync_notify()`, the trigger function every synced table uses |
| `spaternum/notes/` | Tables `note_folders` and `notes`. `tables.py`: models, the folder-loop check, archiving a folder archives its contents. `archive.py`: list and restore for the Archive page |
| `spaternum/voice_notes/` | Table `voice_notes`. `audio.py`: upload (size check, 507 when the disk is full) and streaming with Range. `archive.py`: list and restore |
| `spaternum/archive/` | Owns no tables. `/api/archive` asks each module's `archive.py` |
| `tests/` | pytest against a real Postgres: one `*_test.py` per module, plus `conftest.py` (database and client fixtures) |
| `Dockerfile` | Image built on the machine that runs it (see `ops/`) |

## Client — `client/src/`
Start reading at `main.tsx`, which starts sync and the voice-notes uploads, then `App.tsx` (routes) and `layout/Layout.tsx`.

| Path | What it does |
|---|---|
| `main.tsx` | Starts sync and voice-notes recovery and uploads once for the whole app, then renders `App` |
| `App.tsx` | Routes (hash router). Sends you to Settings until a server and token are saved, or when the token is rejected |
| `App.css` | All styles, plain CSS, one section per screen. The phone layout is under `max-width: 700px` |
| `layout/Layout.tsx` | The frame: rail or bottom bar (sections), side panel or ☰ drawer (only the list of tools), main, and the tool panel on the right (the tool's navigation and details). On the phone both sliding panels close when the screen changes |
| `layout/favorites.ts` | This device's favorite tools in `localStorage`, and the rules: reading the saved list, star on/off, moving up/down |
| `layout/widths.ts` | PC panel widths: limits, defaults, and the dragged widths kept in `localStorage` |
| `api/settings.ts` | Server address and token in `localStorage` |
| `api/client.ts` | `call()`: every direct server call. It adds the token, reads the clock offset and marks online/offline |
| `api/schema.ts` | Generated from the server's OpenAPI (`pnpm gen:api`). Never edit by hand |
| `sync/db.ts` | RxDB: the collections `note_folders`, `notes`, `voice_notes`, their replication, and `awaitInSync(table)` |
| `sync/events.ts` | Reads the SSE stream with fetch, reconnects, 60 s silence watchdog |
| `sync/clock.ts` | `serverNow()`: the device clock corrected by the server's `Date` header |
| `sync/status.ts` | Online dot and "token rejected" state; `onStatusChange()` lets code react to coming back online |
| `notes/notes.ts` | Pure rules: the title (its own, or the first line), what the editor saves (title and body together), order, search, tags, folder tree, allowed moves, hiding what's inside a just-archived folder |
| `notes/store.ts` | Notes and folders read and written in RxDB. The ids of folders archived on this device are kept in `localStorage` |
| `voice-notes/logic.ts` | Pure rules: file names, recovery, the 1-hour split, upload state, playback source, labels, tags |
| `voice-notes/files.ts` | The only code that touches audio files: the `voice-notes/` folder in app storage |
| `voice-notes/recorder.ts` | MediaRecorder with the phase 0 settings. It lives outside React, so recording continues across screens |
| `voice-notes/uploads.ts` | Recovery on start and the upload queue (after Stop, on start, when back online), plus the state the list shows |
| `voice-notes/rows.ts` | Writes to the `voice_notes` collection |
| `voice-notes/audio.ts` | Reading a file's duration, fetching audio from the server, and the player: one recording at a time, with position kept per recording, seeking and speed |
| `archive/archive.ts` | Archive page calls and display rules |
| `screens/` | One screen per route: `NotesScreen`, `VoiceNotesScreen`, `ArchiveScreen`, `FavoritesScreen`, `SettingsScreen`. `Placeholders.tsx` holds Home, Tools, Clients and Projects |
| `*_test.ts` | Vitest tests next to the code they test (`pnpm test`) |

Other client files:
- `client/src-tauri/` is the Tauri shell.
- `capabilities/default.json` holds the fs permissions: the plugin default (reading, folders) plus write, rename and size. There's no remove permission, because phase 1 deletes nothing.
- `gen/android/` is the Android project: the manifest with the mic permissions, and `MainActivity.kt` with the system-bar padding.
- APK steps are in [[TECH]].

**Audio file names on the phone** (the file name is the recording's state; details in [[voice-notes_spec]]):

| File name | Meaning |
|---|---|
| `<id>.<recorded_at ms>.part` | Recording, or interrupted; recovered on the next start |
| `<id>.webm` | Finished, not uploaded yet |
| `<id>.uploaded.webm` | Uploaded |

## Rules for code here
- Follow the patterns in [[TECH]]:
  - Modules don't reach into each other's internals.
  - Client types are generated from OpenAPI.
  - UI code never calls `fs` directly; it goes through `voice-notes/files.ts`.
- Rules without I/O go in plain functions with tests. Screens only wire them up.
- Package manager for the client: **pnpm** ([[2026-10-20-package-manager-pnpm]]).
- Every installed package is logged in `wiki/installed.md` and its exact version pinned in [[TECH]].
- Tests: `feature-name_test.*`.

## Related
[[CLAUDE]] · [[TECH]] · [[tasks]] · [[PRD]] · [[client-foundation_spec]] · [[notes_spec]] · [[voice-notes_spec]] · [[archive_spec]] · [[server-foundation_spec]]
