# PRD — Spaternum

## What it is
A personal workspace ecosystem. One self-hosted **server** is the single source of truth: database, API, and (later) AI. **PC** and **Android** apps are interfaces to it. Each tool — notes, voice notes, project manager, agile dashboard, clients, code editor — is an independent module, but all of them store their data on the same server, so they (and later the AI) can connect across modules.

The app should feel like Teams / VS Code: sections (Home, Tools, Clients, Projects) in a left rail on the PC and a bottom bar on the phone; a side panel (☰ drawer on the phone) listing the tools — Notes, Voice notes, Archive — with the open tool's items under it; the main content; and a panel on the right for tool-specific settings. Later the code editor adds a file explorer and Monaco.

## Why
- A workspace Mihail controls end to end, shaped to how he works.
- Cross-module AI: one place where the AI can see notes, projects and clients together — something separate apps can't offer.
- Building in public: each module is a shippable step and a story to post.

## Users
Mihail only; not a multi-user product for now. Code is public on GitHub under AGPL-3.0 ([[2026-10-20-license-agpl]]), built with the workflow in [[2026-10-20-git-workflow]]. Monetization is not planned.

## Positioning
Tools already cover parts of this: **Nextcloud** (self-hosted files, notes, calendar), **Obsidian** (local notes), **Plane** (project management / agile boards), **AppFlowy** (open-source Notion-style workspace). Spaternum doesn't try to beat any of them at its own job.

The angle is the combination:
- **All modules on one server Mihail controls** — notes, voice notes, projects, clients, code in one data store.
- **AI that works across modules** — e.g. connecting a client to their projects and the voice notes about them. Separate apps can't do this easily.
- **Built around one person's workflow**, with a VS Code-style desktop app.

Why this matters: if the project is ever shared or sold, this is the answer to "why not just use X?". It's also the story for building in public — each module is a post, and the cross-module AI is the payoff that's hard to get elsewhere.

## Architecture
Hub and spoke.
- **Server:** modular monolith — one program, one folder per module, each module owns its tables and API routes and never reaches into another's internals. One thing to deploy and debug; modules can still be split out later.
- **Clients:** thin. Show data, send changes; logic lives on the server.
- **Network:** Tailscale. Only Mihail's devices reach the server; a single API token on top. No user accounts.
- **Offline:** only where it matters — voice notes and notes. Offline-capable modules keep a local copy plus a queue of pending changes; conflicts resolve as **latest write wins** (`updated_at`). Other modules are online-only. Sync: RxDB on the clients, pull/push endpoints on the server, proven by a spike ([[2026-10-21-sync-rxdb]]).
- **Cross-module data:** modules read each other's data through public functions and reference each other by ID; no foreign keys between modules ([[2026-10-20-architecture-modular-monolith]]).
- **Files for the code editor:** live on the PC, accessed only through a small file interface (`list / read / write / watch`) so they can move to the server later without rewriting the UI.

## Stack
| Part | Choice | Why |
|---|---|---|
| Server | Python + FastAPI, managed with uv | Mihail prefers Python; best ecosystem for the planned transcription and RAG work; FastAPI idles at ~50–80 MB, fine on a Pi |
| Database | Postgres + pgvector | RAG is on the roadmap; mature vector search; one extra container under Docker, so low cost. Backups via `pg_dump` |
| Audio storage | Opus files on the server's HDD, metadata in the DB | Small files (~1 MB / 10 min), Whisper reads them, keeps the DB lean |
| Deployment | Docker image (ARM64 + x86_64) + `docker-compose.yml` + `install.sh` | Same install on any machine; Pi now, home server later. Deployable as a Portainer stack |
| Desktop | Tauri 2 + React + TypeScript, Monaco editor | Much lighter than Electron; Monaco is VS Code's editor |
| Android | Same Tauri 2 codebase | One UI codebase. Fallback: a web app (PWA) served by the server |
| Client types | Generated from FastAPI's OpenAPI schema (`openapi-typescript`) | Keeps client and server in sync across two languages |
| AI now | Claude Code (Pro) as a terminal panel in the desktop app | Strong, already paid for, almost no code |
| AI later | faster-whisper, embeddings + RAG, Ollama | Added as containers/workers once the home server exists |

All free software.

## Hosting
- **Now:** Raspberry Pi 4, 8 GB, ARM64 (`aarch64`), Docker + Portainer, Tailscale. Data on an attached HDD.
- **Later:** a dedicated home server (likely x86_64). Move = copy the data folder, run `install.sh`.
- **Dev PC (laptop):** Arch Linux, 15 GB RAM, NVIDIA GTX 1650 Ti Mobile with 4 GB VRAM. Enough for small local models (~3–4B, quantized) and Whisper transcription at usable speed. Since it's a laptop and not always on, it can only be an optional AI helper, not the AI server.

## Phases
0. **Prototype (throwaway):** Tauri 2 app on the Xiaomi 14T (Android 16) that records mic audio as Opus, saves it locally and plays it back. Proves the risky part before anything is built around it.
1. **Notes + voice notes:** server, Postgres, Docker install, desktop + Android clients. Both offline-capable. Voice notes = mic recording on Android only (the PC views and listens), offline-first with upload queue. Notes: [[notes_spec]]. Also the shared **Archive page** — archived items from every module, kept only on the server.
2. **Transcription:** faster-whisper background worker on the server.
3. **Transcript analysis / RAG.**
4. Further modules, one at a time: project manager, agile dashboard, clients, code editor (file explorer + Monaco + Claude Code panel).

## Cut / parked
- **Phone call recording** — Android 10+ blocks apps from capturing call audio, and the stock dialer on Mihail's phone has no record button. Speakerphone + normal voice note works as a manual fallback. Revisit only if the phone or OS changes.
- **AI on the Pi** — no GPU; only small, slow models. Deferred to the home server.
- **Multi-user / accounts.**
- **Client release automation** (GitHub Actions builds) — later.

## Where the rest lives
- How it's built (versions, setup, patterns): [[TECH]]
- Why each choice was made, and alternatives: `planning/decisions/`
- Risks: [[risks]]
- Current work and pending decisions: [[tasks]]
- Phase 0 spec: [[voice-recorder-prototype_spec]]
- Agile dashboard spec (phase 4): [[agile-dashboard_spec]]
- Notes spec (phase 1): [[notes_spec]]
- Voice notes spec (phase 1): [[voice-notes_spec]]

## Related
[[CLAUDE]] · [[portfolio]] · [[projects]] · [[TECH]] · [[risks]] · [[tasks]] · [[notes_spec]]
