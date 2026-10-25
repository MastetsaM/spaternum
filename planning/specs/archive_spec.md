# Spec — Archive module, server (phase 1, block 5)

## What and why
One place for everything archived, from every module: the shared Archive page lists it and restores it. Archives live only on the server ([[2026-10-21-sync-rxdb]]). The design was decided in [[2026-10-20-architecture-modular-monolith]] (Shared Archive); this spec only pins down the endpoints. The client page is block 9 ([[tasks]]).

## Behaviour
- The `archive` module **owns no tables**. It calls each module's public `list_archived(conn)` and `restore(conn, id)` — today `notes` and `voice_notes`. A new module joins by adding those two functions and one line in the archive module's list.
- `GET /api/archive?type=<type>` → every archived item, newest first:
  `{module, type, id, title, archived_at, items}` (+ `recorded_at` for voice notes). `type` is `folder`, `note` or `voice_note`; without it, everything. An archived folder is one entry with `items` = what was archived with it ([[notes_spec]]).
- `POST /api/archive/{module}/{id}/restore` → restores through that module; `404` if the module is unknown or nothing archived has that id. Restored items reach devices as a normal sync change.
- Both need the token, like every `/api` route.

## Acceptance criteria (done when…)
1. The list contains archived notes, folders and voice notes together, newest first, each tagged with its module and type.
2. `?type=` filters the list.
3. Restore works for a note, a folder (with its contents) and a voice note, and the item leaves the list.
4. Unknown module or id → `404`.
5. Tests pass.

## Results (2026-10-25)
All 5 criteria met; 4 tests in `tests/archive_test.py` pass (37 server tests in total).

## Out of scope
- Paging (single user; revisit if the list gets long).
- Deleting for good — archive, never delete.
- Searching the archive.

## Related
[[tasks]] · [[notes_spec]] · [[voice-notes_spec]] · [[server-foundation_spec]] · [[2026-10-20-architecture-modular-monolith]] · [[2026-10-21-sync-rxdb]]
