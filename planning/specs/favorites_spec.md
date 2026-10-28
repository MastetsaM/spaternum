# Spec — Favorite tools

## What and why
The left side panel (☰ drawer on the phone) lists every tool. As tools grow, that list gets long. Mihail picks his **favorite tools** on a Favorites page, and the side panel lists only those. The choice is **per device** (Mihail, 2026-10-28).

## Behaviour
- **Side panel:** a **★ Favorites** entry first, then the favorite tools **in Mihail's order**. ★ Favorites opens `/tools/favorites`.
- **Favorites page** (`/tools/favorites`, header "Favorites"): the favorites first, in their order, each with **up and down arrows** to move it. Then the other tools in the fixed tool order. Every tool has a star to switch it on or off. A newly starred tool goes to the end of the favorites. A change applies at once, with no Save button.
  - Drag and drop is wanted later (Mihail, 2026-10-28). It only changes the page's controls; the saved list stays the same.
- **The Tools section's main screen** (`/tools`) still lists every tool, so a tool that isn't a favorite is always reachable.
- **Defaults** (confirmed by Mihail, 2026-10-28):
  - Before anything is chosen, **every tool is a favorite**, in the fixed tool order, so nothing disappears on update.
  - Removing every favorite is allowed: the side panel then shows only ★ Favorites.
- An open tool that isn't a favorite still works; it just isn't listed in the side panel.

## Saved on each device
Each device has **its own favorites and order** (Mihail, 2026-10-28). The PC and the phone can differ, and the server isn't involved.
- Kept in `localStorage` under `spaternum.favoriteTools`: a JSON list of tool keys (`notes`, `voice-notes`, `archive`) **in display order**.
- Unknown keys (e.g. a tool removed later) are ignored. A missing or broken value means the default: every tool.
- A first version synced the list through a server `settings` table. That came from a misunderstanding of the question and was removed the same day, before reaching main.

## Acceptance criteria (done when…)
1. Starring, un-starring and moving on the Favorites page changes the side panel at once.
2. The choice stays after the app restarts, and doesn't affect the other device.
3. Before anything is chosen, every tool shows.
4. `/tools` still lists every tool.
5. Server and client tests pass.

## Results (2026-10-28)
- Built in `layout/favorites.ts` (rules and `localStorage`), `screens/FavoritesScreen.tsx` and the side panel in `layout/Layout.tsx`. 5 Vitest tests in `layout/favorites_test.ts`; 70 client tests pass; the build passes.
- Mihail checked it on the PC: it works. The phone gets it with the next APK.
- Later ideas for the Tools page (Android-style groups, drag and drop) are in [[tasks]] under "Later".

## Out of scope
- Drag and drop (later).
- Favorites in the rail or the phone's bottom bar (option b, not chosen).
- Syncing favorites across devices.

## Related
[[ui-design_spec]] · [[client-foundation_spec]] · [[tasks]]
