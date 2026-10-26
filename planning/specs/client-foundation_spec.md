# Spec — Client foundation (phase 1, block 6)

## What and why
The base of the one app that runs on the PC and on Android: the Tauri project, the first-start settings, the local database with sync, and the empty layout the modules plug into. No notes or voice-notes screens yet — those are blocks 7 and 8 ([[tasks]]). The sync part is the spike's client, cleaned up and extended with the live stream ([[sync-spike_spec]], [[2026-10-21-sync-rxdb]]).

## What gets built
- **Project:** `src/client/`, Tauri 2 + React + TypeScript (same template as the prototypes), app name **Spaternum**, id `com.mastetsam.spaternum`. Android: `RECORD_AUDIO` + `MODIFY_AUDIO_SETTINGS` in the manifest, `plugin-fs` for audio files later.
- **API types:** generated from the server's `/openapi.json` with `openapi-typescript` into `src/api/schema.ts`, by one command (`pnpm gen:api`). Never edited by hand.
- **First-start settings:** if no server address or token is saved, the app opens a settings screen: server address + API token, a **Test connection** button (calls `/health`, then an `/api` route to check the token), Save. Reachable later from the left rail. Stored in the webview's `localStorage` (only this app can read it).
- **Local database and sync** (`src/sync/`):
  - RxDB opened once (StrictMode runs effects twice in development).
  - One collection per synced table: `note_folders`, `notes`, `voice_notes`, schemas matching the server.
  - One replication helper: pull by `seq`, push, server rows taken on conflict — as in the spike.
  - **Live stream:** one `fetch` to `/api/events` (EventSource can't send the token); each event names a table → that collection pulls. Reconnects with a growing pause (1 s → 30 s) when the stream drops; on reconnect every collection pulls once to catch up.
  - **Clock drift:** the offset from the server's `Date` header is measured on each successful call; `updated_at` = device time + offset.
  - **Online indicator:** from the last sync result (stream connected, last call OK) — not `navigator.onLine`.
- **Layout** (Teams / VS Code style; structure corrected by Mihail 2026-10-26):
  - **Sections:** Home (dashboard), **Tools**, Clients, Projects. PC: left rail; phone: bottom bar. Home, Clients and Projects are placeholders until their phases.
  - **Settings** slightly hidden: a gear at the bottom of the rail (PC) / top-right of the header (phone).
  - **Side panel** (PC) / **☰ drawer** (phone): for Tools, the list of tools — Notes, Voice notes, Archive; the open tool shows its own items under it (e.g. the notes folder tree).
  - **Tool panel** on the right for tool-specific settings and details (PC, can be closed); on the phone it opens from a button.
  - Switches by window width, so a narrow PC window behaves like the phone.
  - Modules fill in the panels in later blocks; here they show placeholders.
  - **Screens are routes** (`react-router`): `/home`, `/tools/notes`, `/tools/voice-notes`, `/tools/archive`, `/clients`, `/projects`, `/settings`. Android's back gesture walks back through screens instead of closing the app; later a route can open one note directly.
  - Plain CSS (a grid for the layout), icons from `lucide-react`.
- **Builds:** `pnpm tauri dev` on the PC; a signed release APK installed on the phone (steps in [[TECH]]).

## Acceptance criteria (done when…)
1. The app starts on the PC and on the phone.
2. First start shows the settings screen; with a wrong address or token, Test connection says which one is wrong; after Save the app opens the layout and remembers the settings after a restart.
3. Generated API types compile, and a server change shows up after `pnpm gen:api`.
4. With two devices on: a row written through the API (e.g. a note pushed with `curl`) appears in both devices' local databases within ~2 s, without polling.
5. Offline (airplane mode on the phone): the indicator shows offline; writes to the local database stay; back online they reach the server and the indicator turns online.
6. PC: rail with Home, Tools, Clients, Projects (+ gear), side panel listing the tools with the open tool's items, main, tool panel. Phone: the same sections in the bottom bar, the tools in the ☰ drawer, gear top-right, tool panel from a button.
7. Vitest tests pass for the logic that isn't UI: clock offset, reconnect pause, event → collection routing, settings validation.

## Edge cases and failure modes
- Server address without `https://` or with a trailing `/` → normalised before saving.
- Token changed on the server (re-install) → calls answer 401 → the app shows "token rejected" and opens settings.
- Stream drops while the app is in the background on Android → reconnect when it's back; catch-up pull covers what was missed.
- Local database from an older app version → RxDB schema versions with migration functions from the first schema change on (version 0 now).

## Out of scope
- Notes, voice-notes and Archive screens (blocks 7–9).
- Styling beyond clean and usable; dark/light theme switch.
- Release automation, app store, auto-update.
- Monaco and the code editor.

## Decided 2026-10-26
Token and address in `localStorage` · plain CSS · `lucide-react` icons · `react-router` for screens (Android back gesture, links to a note later).

## Related
[[tasks]] · [[TECH]] · [[PRD]] · [[sync-spike_spec]] · [[notes_spec]] · [[voice-notes_spec]] · [[archive_spec]] · [[server-foundation_spec]] · [[2026-10-21-sync-rxdb]] · [[2026-10-20-clients-tauri-react]]
