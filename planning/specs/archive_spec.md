# Spec — Archive module (phase 1, server block 5, client block 9)

## What and why
One place for everything archived, from every module: the shared Archive page lists it and restores it. Archives live only on the server ([[2026-10-21-sync-rxdb]]). The design was decided in [[2026-10-20-architecture-modular-monolith]] (Shared Archive); this spec pins down the endpoints (block 5) and the client page (block 9, [[tasks]]).

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

## Client page (block 9)
The Archive tool (`/tools/archive`) shows the list above. Online only: it calls the server directly, nothing is kept on the device ([[2026-10-21-sync-rxdb]]).
- **List:** one row per entry, newest first as the server sends it: type, title, archived date-time in local time, **Restore**. A folder adds "N items". A voice note with an empty title shows its `recorded_at` in local time instead ([[voice-notes_spec]]).
- **Filter:** All · Notes · Folders · Voice notes, above the list; picking one calls `?type=`.
- **Restore:** one tap, no confirmation (nothing is lost — it can be archived again). The row leaves the list; the item comes back to devices through sync. A `404` means it was already restored elsewhere → the row leaves the list with a short note.
- **Offline / errors:** server not reachable → "The archive needs the server" + Retry; other errors show the status. A rejected token opens the settings, as everywhere ([[client-foundation_spec]]).
- **PC and phone:** the same page; filter and list in the main area, no side or tool panel content.

Client criteria:
6. The page lists notes, folders and voice notes with the details above; the filter narrows it.
7. Restore brings the item back on the device(s) and it leaves the list.
8. Offline, the page says it needs the server and recovers with Retry.
9. Vitest tests pass for the display logic (titles, dates, filter labels).

Client results (2026-10-28): built (`src/client/src/archive/`, `screens/ArchiveScreen.tsx`); 9 passes (5 tests in `archive_test.ts`, 13 client tests in total); `pnpm build` passes. 6–8 still to check on the phone and the PC.

## Out of scope
- Paging (single user; revisit if the list gets long).
- Deleting for good — archive, never delete.
- Searching the archive.

## Related
[[tasks]] · [[notes_spec]] · [[voice-notes_spec]] · [[server-foundation_spec]] · [[client-foundation_spec]] · [[2026-10-20-architecture-modular-monolith]] · [[2026-10-21-sync-rxdb]]
