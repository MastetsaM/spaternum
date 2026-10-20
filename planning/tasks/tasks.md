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
- [ ] Scaffold `src/prototypes/voice-recorder` with create-tauri-app (React + TS)
- [ ] `pnpm tauri android init`; add `RECORD_AUDIO` to the Android manifest
- [ ] Build the single screen: Record / Stop / list / Play / Delete
- [ ] Save recordings with `@tauri-apps/plugin-fs` to app storage
- [ ] Run on the phone with `pnpm tauri android dev`
- [ ] Test against the acceptance criteria and edge cases in [[voice-recorder-prototype_spec]]
- [ ] Write results in the spec; decide go / fallback with Mihail
- [ ] Log every installed package in `wiki/installed.md`; pin exact versions in [[TECH]]

## Before phase 1 (decisions needed)
- [ ] ORM (SQLAlchemy + Alembic) vs plain SQL with psycopg
- [ ] Notes data model (fields, Markdown or plain text, tags?)
- [ ] Write `notes_spec.md` and `voice-notes_spec.md`

## Related
[[PRD]] · [[TECH]] · [[risks]]
