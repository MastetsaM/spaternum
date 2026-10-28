# Spec — Favorite tools

## What and why
The left side panel (☰ drawer on the phone) lists every tool. As tools grow, that list gets long. Mihail picks his **favorite tools** on a Favorites page, and the side panel lists only those. The choice **syncs across devices** (Mihail, 2026-10-28).

## Behaviour
- **Side panel:** a **★ Favorites** entry first, then the favorite tools **in Mihail's order**. ★ Favorites opens `/tools/favorites`.
- **Favorites page** (`/tools/favorites`, header "Favorites"): the favorites first, in their order, each with **up and down arrows** to move it. Then the other tools in the fixed tool order. Every tool has a star to switch it on or off. A newly starred tool goes to the end of the favorites. A change applies at once, with no Save button.
  - Drag and drop is wanted later (Mihail, 2026-10-28). It only changes the page's controls; the saved list stays the same.
- **The Tools section's main screen** (`/tools`) still lists every tool, so a tool that isn't a favorite is always reachable.
- **Defaults** (confirmed by Mihail, 2026-10-28):
  - Before anything is chosen, **every tool is a favorite**, in the fixed tool order, so nothing disappears on update.
  - Removing every favorite is allowed: the side panel then shows only ★ Favorites.
- An open tool that isn't a favorite still works; it just isn't listed in the side panel.

## Sync and data
A new server module, **`settings`**, holds small settings that follow Mihail across devices. It's a synced table like the others ([[2026-10-21-sync-rxdb]]), so it works offline and the latest write wins ([[2026-10-20-offline-latest-write-wins]]).

```sql
CREATE TABLE settings (
    id          uuid PRIMARY KEY,      -- fixed per key, the same on every device (below)
    key         text NOT NULL UNIQUE,  -- e.g. 'favorite_tools'
    value       text NOT NULL,         -- JSON, e.g. '["notes", "archive"]'
    created_at  timestamptz NOT NULL,
    updated_at  timestamptz NOT NULL,
    archived_at timestamptz,           -- unused: settings are never archived
    seq         bigint NOT NULL
);
```

- **Fixed id per key:** two devices that save the same setting for the first time must write the same row, not two rows. Each key's id is a constant in the client code.
- **`value` is JSON stored as text.** The server never looks inside it, and the sync helper passes text through unchanged. A `jsonb` column would need extra conversion code in the shared sync helper for no gain today.
- `favorite_tools` holds the tool keys (`notes`, `voice-notes`, `archive`) **in display order**. Unknown keys, e.g. a tool removed later, are ignored, and so is a broken value (the default is used).
- The whole list is one value, so the latest write wins for the whole list. That's fine for one person.
- Settings never show in the Archive page; the module has no `archive.py`.
- **Per-device things stay per device:** panel widths and the server address and token aren't synced.

## Acceptance criteria (done when…)
1. Starring, un-starring and moving on the Favorites page changes the side panel at once.
2. The change reaches the other device live, and after being offline.
3. Before anything is chosen, every tool shows.
4. `/tools` still lists every tool.
5. Server and client tests pass.

## Out of scope
- Drag and drop (later).
- Favorites in the rail or the phone's bottom bar (option b, not chosen).
- Other synced settings. The table is ready for them, but each is proposed first.

## Related
[[ui-design_spec]] · [[client-foundation_spec]] · [[archive_spec]] · [[2026-10-21-sync-rxdb]] · [[2026-10-20-offline-latest-write-wins]] · [[2026-10-20-architecture-modular-monolith]] · [[tasks]]
