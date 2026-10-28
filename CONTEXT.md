---
tags:
  - project
  - project/spaternum
---

# CONTEXT — Spaternum

## What this is
Personal workspace ecosystem: a self-hosted server (Postgres, API, later AI) with PC and Android clients. Independent modules (notes, voice notes, projects, clients, code editor) converge on the server. Self-directed build, public on GitHub under AGPL-3.0.

Full picture — architecture, stack, phases, what's cut: [[PRD]]. How it's built: [[TECH]].

## Status
As of 2026-10-28:
- **Phase 1 (notes + voice notes) is done.**
  - The server runs on the Pi over Tailscale.
  - The Android app (release APK) and the PC app (`pnpm tauri dev`) were checked against it.
- **Next:** merge notes and voice notes into one note ([[notes-recordings_spec]], draft).

Ideas and loose ends: [[tasks]] under "Later".

## Workspaces
| Folder | Read first |
|---|---|
| `planning/` | `planning/CONTEXT.md` |
| `src/` | `src/CONTEXT.md` |
| `docs/` | `docs/CONTEXT.md` |
| `ops/` | `ops/CONTEXT.md` |

## Related
[[CLAUDE]] · [[PRD]] · [[TECH]] · [[tasks]] · [[portfolio]]
