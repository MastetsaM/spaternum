# TECH — Spaternum

Technical reference. The *why* behind each choice lives in [[PRD]] and the decision records under `planning/decisions/`; this file is the how.

## Architecture overview

```
 PC (Tauri: React + Monaco)        Android (Tauri: same React UI)
            \                              /
             \—— Tailscale, HTTPS + API token ——/
                              |
              Server (Docker, Pi 4 now → home server later)
              ├─ FastAPI app — one module per feature
              │    notes/  voice_notes/  (later: projects/, clients/, …)
              ├─ Postgres + pgvector — structured data, embeddings
              └─ /data on HDD — audio files (Opus)
```

- **Modules:** each server module owns its folder, its tables (prefixed or in its own schema) and its routes under `/api/<module>/…`. Modules don't import each other's internals; if one needs another's data, it goes through that module's public functions. Cross-module references are IDs only, with no foreign keys between modules ([[2026-10-20-architecture-modular-monolith]]).
- **Clients** hold no business logic. Online-only modules call the API directly. Offline modules keep a local copy + outbox (see below).
- **Archive module** (no tables of its own): `GET /archive` collects from each module's public `list_archived()`, `POST /archive/{module}/{id}/restore` calls its `restore(id)`. One shared Archive page in the client, online only ([[2026-10-20-architecture-modular-monolith]]).
- **Files on PC** (code editor module, later): every file operation goes through one interface — `list / read / write / watch` — never direct `fs` calls from UI code.

## Key implementation patterns
Where each piece lives in the code: `src/CONTEXT.md`.

### Offline (only for modules that need it — voice notes and notes)
- Every record has `id` (UUID, generated on the client so it exists before upload), `created_at`, `updated_at`, `archived_at` (archive, never delete — archived rows tell other devices a record is gone).
- Client: **RxDB** collection per module, free IndexedDB (Dexie) storage, HTTP replication. Writes go to the local DB first; RxDB queues and retries them.
- Server: per synced table, `GET` **pull** (changes after a checkpoint `seq`, ordered, limited — `seq` is assigned by the server from a sequence on every write; never pull by the client's `updated_at`, which would miss late pushes of old offline edits) and `POST` **push** (latest-write-wins upsert: `ON CONFLICT (id) DO UPDATE … WHERE excluded.updated_at > t.updated_at`). One reusable helper; SQL stays in each module.
- Schema change = SQL migration on the server **and** a bumped RxDB schema version with a migration function on the client.
- Conflicts: **latest `updated_at` wins**. Single user, so acceptable.
- Server push: SSE endpoint fed by Postgres `LISTEN/NOTIFY` → RxDB pull stream; the `seq` pull catches up after offline periods.
- Clock drift: correct `updated_at` with the offset from the server's `Date` header.
- Online/offline indicator comes from the last sync's result — `navigator.onLine` stays true in airplane mode on Android.
- Open the RxDB database once (React StrictMode runs effects twice in development).
- **Archives stay on the server:** archiving = RxDB remove (`_deleted: true` on push → server sets `archived_at`, keeps the row); pull sends archived rows as `_deleted: true`; RxDB cleanup plugin clears deletion markers. Restore only on the server.
- Proven in the sync spike — see [[sync-spike_spec]] and [[2026-10-21-sync-rxdb]].

### Audio
- Recorded with the browser `MediaRecorder` API, Opus codec (`audio/webm;codecs=opus` — confirmed on the phone; `audio/ogg;codecs=opus` as fallback).
- Settings proven in phase 0 ([[voice-recorder-prototype_spec]]): `getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })` and `audioBitsPerSecond: 32000` → clear speech at ~200–250 KB/min. The webview defaults sound muffled and use ~125 kbps.
- Android manifest needs **both** `RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS` — Tauri's `RustWebChromeClient` requests both, and fails with `NotAllowedError` if either is missing.
- Android shared storage (`/storage/emulated/0/Documents/…`) can't be written by path (`os error 13`).
- Recording on Android only; the PC streams from the server ([[voice-notes_spec]]). Local audio: Android app storage. Deleted from the device only after upload + transcription + Mihail's validation of the transcript; then played by streaming from the server ([[2026-10-21-local-files-location]]).
- Server stores the file on the HDD at `/data/audio/<uuid>.webm`; the path is derived from the id, not stored. The DB row keeps id, timestamps, duration, size, upload time, and later transcript ([[voice-notes_spec]]).

### API contract
- FastAPI publishes an OpenAPI schema at `/openapi.json`.
- Client types are generated from it with `openapi-typescript` — never hand-written. Every JSON route declares its response shape (sync pull/push declare theirs for the schema only, so timestamps keep the `toISOString()` format); a test fails if one is missing.
- Auth: header `Authorization: Bearer <token>`; token is generated by `install.sh` and stored in the server's `.env`.

### Deployment
- One `ops/docker-compose.yml`: `api` (FastAPI) + `db` (Postgres + pgvector). Both bound to `127.0.0.1`; other devices reach the API through `tailscale serve` (HTTPS).
- The image is **built on the machine that runs it** — no registry, no `buildx` ([[2026-10-20-deployment-docker-compose]]).
- Data folders are bind mounts under `DATA_ROOT` (Pi: `/mnt/hdd/spaternum`); Docker won't create them, so a missing HDD stops the containers instead of filling the SD card. Containers are disposable.
- `ops/install.sh` (once per machine), `ops/update.sh` (pull `main` → build → migrate → restart), `ops/backup.sh` (`pg_dump` + `files/`, last 7) — [[deploy_spec]].
- Logs: Docker `json-file`, 10 MB × 5 per container.
- **Release flow:** the server runs on the PC during development (phone reaches it over Tailscale). The Pi runs `main` only, and is updated only after a change is fully tested on the PC: pull → rebuild → migrate → restart.

## Packages

Latest versions as of 2026-10-20. **Pinned for real when installed** — the exact installed version replaces these and is logged in `wiki/installed.md`.

### Phase 0 — prototype (decided)
| Package | Version | Purpose |
|---|---|---|
| create-tauri-app | 4.7.5 (installed) | Scaffolds the app (run once via `pnpm dlx`, not a dependency) |
| @tauri-apps/cli | 2.12.3 (installed) | Build/dev commands, Android init |
| @tauri-apps/api | 2.12.4 (installed) | JS ↔ Rust bridge |
| @tauri-apps/plugin-opener | 2.7.2 (installed) | Opens links/files with the system app; added by the template, not used by the prototype |
| @tauri-apps/plugin-fs (+ Rust crate tauri-plugin-fs) | 2.7.1 (installed) | Save recordings to app storage |
| react, react-dom | 19.3.1 (installed) | UI |
| @types/react, @types/react-dom | 19.3.0 (installed) | React types |
| vite | 8.3.4 (installed) | Dev server / bundler |
| @vitejs/plugin-react | 6.1.2 (installed) | React support for Vite |
| typescript | 6.0.3 (installed) | Types — the template pins `~6.0.3`; 7.0.2 is the latest |

The template may pin slightly different versions; whatever it installs is what gets recorded. Exact versions live in the prototype's `pnpm-lock.yaml`.

### Phase 1 — server and real clients (installed ones marked; the rest proposed)
| Package | Version | Purpose |
|---|---|---|
| uv | 0.13.4 (installed) | Python package/venv manager |
| fastapi | 0.150.0 (installed) | API framework |
| uvicorn | 0.54.0 (installed) | ASGI server |
| psycopg[binary] | 3.3.6 (installed) | Postgres driver |
| psycopg-pool | 3.3.3 (installed) | Connection pool ([[server-foundation_spec]]) |
| pytest, httpx | 9.1.1, 0.28.1 (installed, dev only) | Server tests; httpx is needed by FastAPI's test client |
| pgvector (Python) | 0.5.1 | Vector type support |
| Docker image `pgvector/pgvector` | 0.8.7-pg18 (in use) | Postgres 18 + pgvector |
| openapi-typescript | 7.13.0 | Generate client types |
| monaco-editor / @monaco-editor/react | 0.57.0 / 4.7.0 | Code editor module (later phase) |
| faster-whisper | 1.2.1 | Transcription (phase 2) |
| @fullcalendar/react | 7.1.3 | Calendar views: year, month, week, day ([[2026-10-29-calendar-fullcalendar]]). Brings `@fullcalendar/core` and `@full-ui/headless-calendar`; needs `temporal-polyfill` ^1.0.1 |
| rrule-temporal | 2.2.8 | Expands repeating calendar events (RFC 5545 `RRULE`) on the device |
| rxdb (+ Dexie storage), rxjs | 17.6.0, 7.8.2 (installed in the spike) | Client local DB + replication for offline modules ([[2026-10-21-sync-rxdb]]). Apache 2.0 per its LICENSE.txt; Dexie storage and the CRDT plugin are in the free package |

Database access: plain SQL with psycopg, numbered `.sql` migrations applied by our own script, no ORM — see [[2026-10-21-database-access-plain-sql]].

## Dev setup

Already done on Mihail's PC (Arch Linux, 2026-10-20) — logged in `wiki/installed.md`:

```bash
# Tauri Linux prerequisites
sudo pacman -S --needed webkit2gtk-4.1 base-devel curl wget file openssl appmenu-gtk-module libappindicator-gtk3 librsvg xdotool
# Audio playback in the PC app (voice notes); added 2026-10-28. A PC install of the app must depend on it
sudo pacman -S --needed gst-plugins-good
# Rust + Android target
sudo pacman -S --needed rustup
rustup default stable
rustup target add aarch64-linux-android
```

`~/.bashrc`:
```bash
# Android / Tauri
export JAVA_HOME=/opt/android-studio/jbr          # JDK 21 — system JDK 27 is too new for Tauri's Gradle
export ANDROID_HOME="$HOME/Android/Sdk"
export NDK_HOME="$ANDROID_HOME/ndk/$(ls -1 "$ANDROID_HOME/ndk" | sort -V | tail -1)"
export PATH="$PATH:$ANDROID_HOME/platform-tools"
```

Check:
```bash
rustc --version && rustup target list --installed
"$JAVA_HOME/bin/java" -version
adb devices        # phone must show as "device"
```

### Phone (Xiaomi 14T, HyperOS 3, Android 16)
- USB debugging + "Install via USB" are on in the **main space** — Second Space can't enable debugging.
- Dev builds install to the main space. Stable builds go to **Second Space** (work profile): `adb shell pm list users` → `adb install --user <id> app.apk`, or copy the `.apk` and install from inside Second Space.

### Phase 0 commands (used)
```bash
cd projects/spaternum/src/prototypes
pnpm dlx create-tauri-app@4.7.5 voice-recorder --template react-ts --manager pnpm \
  --identifier com.mastetsam.voicerecorder --tauri-version 2 --yes
cd voice-recorder && pnpm install
pnpm tauri android init --ci           # also installs the other 3 Android Rust targets
pnpm tauri add fs                      # JS package + Rust crate + capability
```
`src-tauri/gen/android/` is tracked in git (it holds the manifest); its own `.gitignore` skips build output.

### Build an APK and send it to the phone
Used when Mihail tests from his phone over Remote Control (no USB). A debug APK is ~134 MB, too big to send (30 MiB limit); a release APK is ~6.5 MB. Sign it with the Android debug key — fine for personal testing, not for publishing.
```bash
BT=$ANDROID_HOME/build-tools/37.0.0
OUT=src-tauri/gen/android/app/build/outputs/apk/universal/release
pnpm tauri android build --apk --target aarch64
$BT/zipalign -f -p 4 $OUT/app-universal-release-unsigned.apk aligned.apk
$BT/apksigner sign --ks ~/.android/debug.keystore --ks-pass pass:android \
  --ks-key-alias androiddebugkey --key-pass pass:android --out app.apk aligned.apk
$BT/apksigner verify app.apk
```
Same key every time, so a new APK installs over the old one.

## What not to use, and why
- **Microservices** — one feature per service is harder to run and debug; modular monolith instead.
- **SQLite** — fine for data, but sqlite-vec is young; RAG is planned, so Postgres + pgvector.
- **Electron** — heavier, no Android build.
- **Storing audio in the DB** — bloats it and slows backups.
- **Building a code editor from scratch** — use Monaco.
- **Direct `fs` calls in UI code** — breaks the plan to move files to the server later.
- **AI models on the Pi** — no GPU; deferred to the home server.
- **An ORM (SQLAlchemy)** — data is simple and SQL is clearer; see [[2026-10-21-database-access-plain-sql]].
- **PowerSync / ElectricSQL** — not free software / read-path only; see [[2026-10-21-sync-rxdb]].
- **Foreign keys between modules, or between synced tables** — couple module schemas and break offline sync ordering (a row can arrive before the one it points to).

## Related
[[PRD]] · [[CLAUDE]] · [[risks]] · [[tasks]] · [[voice-recorder-prototype_spec]] · [[notes_spec]] · [[installed]] · [[2026-10-21-sync-rxdb]] · [[2026-10-21-database-access-plain-sql]] · [[2026-10-29-calendar-fullcalendar]]
