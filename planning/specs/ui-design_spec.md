# Spec — How the app looks (UI design)

## What and why
The client should stay quiet and simple: content first, few colours, no decoration. Mihail likes the current look (2026-10-28), so this page writes down the rules behind it, taken from the code (`src/client/src/App.css` and the screens). Every new screen follows these rules, and the gaps listed below get fixed so all screens look the same.

The structure (rail, side panel, main, tool panel, phone drawer) is in [[client-foundation_spec]]. This page covers only how it looks.

## Feel
- **Content first.** The note, the recording or the list is the screen. Chrome stays in grey and out of the way.
- **Flat.** No cards, no shadows, no gradients. Lists are rows split by a thin line. The only shadow is on the phone's sliding panels, so they read as "on top".
- **One accent colour.** It marks what is active or selected. Red is used only for errors and danger, green only for "online" and "uploaded".
- **Words over icons when unsure.** Icons sit next to a label, except in the rail, the header buttons and the close buttons.
- **No pop-ups.** Confirmations appear inline, in place, e.g. "Archive X with N notes?" with two buttons. There is no `alert` or `confirm`, and the Android webview doesn't show them reliably anyway.
- **Light and dark** follow the system, with the same tokens.

## Colours (tokens in `:root`)
| Token | Light | Dark | Used for |
|---|---|---|---|
| `--bg` | `#ffffff` | `#1b1b1f` | Main area, inputs, the active item's background |
| `--panel` | `#f5f5f7` | `#232328` | Side panel, tool panel |
| `--rail` | `#ebebef` | `#16161a` | Rail, bottom bar |
| `--line` | `#dcdce2` | `#34343b` | Borders, row dividers |
| `--text` | `#1d1d22` | `#e8e8ec` | Text |
| `--muted` | `#6b6b76` | `#9a9aa5` | Secondary text, inactive icons, empty states |
| `--accent` | `#4f5bd5` | same | Active, selected, the primary action |
| `--ok` | `#2f9e5b` | same | Online dot, "Uploaded" |
| `--error` | `#c93c3c` | same | Errors, danger buttons, Stop, "Not uploaded" |
| `--on-accent` | `#ffffff` | same | Text on accent and error fills (Record, Stop) |

Colours come only from these tokens. A new colour needs a new token, and that gets proposed first.

## Text
- System font (`system-ui`), base **15px**.
- Sizes: screen title 17px bold; body 15px; meta lines (dates, sizes, counts) 13px in `--muted`; panel section labels 12px uppercase in `--muted`; rail labels 10px.
- Use `px` everywhere, the same as the rest of the file.
- **Header:** the same 48px height on every screen. It always shows the **tool or section name** (Notes, Voice notes, Archive, Home, Settings), never a folder or note title (Mihail, 2026-10-28). It stays on one line and is cut with an ellipsis if needed.
- Titles cut off with an ellipsis instead of wrapping in lists. Note text in the editor wraps normally, with line height 1.5.

## Spacing and shapes
- Spacing steps: 4, 6, 8, 12, 16 px. Gaps between controls are 6–8; padding inside panels is 12; padding in the main content is 16.
- Corners: 6px for buttons, inputs and list highlights; 8px for rail items; 12px for tag pills; round for the status dot.

## Icons
- `lucide-react` only.
- Sizes: 22 in the rail and bottom bar, 20 for header buttons, 18 for tool-list rows, 16 inside buttons and list rows, 12–15 inside small inline marks.

## Pieces
| Piece | Looks like |
|---|---|
| **Button** | Outline: 1px `--line` border, no fill, text colour. Icon + label when it has an icon |
| **Primary button** | Filled `--accent` with white text. Only the one main action of a screen, e.g. Record |
| **Danger button** | Outline in `--error` (Archive inside a confirmation; Stop is filled red) |
| **Icon button** | No border (close ✕, clear search) |
| **Input / textarea / select** | `--bg` fill, 1px `--line` border, 6px corners, full width |
| **List row** | Padding 10–12px top and bottom, bottom border `--line`. Title on the first line (600 weight), meta line below in 13px `--muted`. Notes rows are the title only, one line, cut with "…" |
| **Active item** (rail, tool list, folder) | `--accent` text on `--bg` background |
| **Tag** | Pill (`.tag`): 1px border, 12px corners, 13px. Selected = `.on` (`--accent` border and text). Used for tags on items and for tag filters |
| **Filter buttons** (e.g. Archive types) | Outline buttons in a wrapping row. Active = `.on` |
| **Status dot** | 10px circle: `--ok` online, `--muted` offline |
| **Empty state** | One short line in `--muted`, e.g. "Nothing archived." |
| **Error** | One line in `--error`, with a Retry button when retrying helps |
| **Loading** | "Loading…" in `--muted`; no spinners |
| **Confirmation** | Inline: the question as text, then the danger button and Cancel |

## Panel widths (PC)
Asked for by Mihail on 2026-10-28.
- Both the side panel and the tool panel can be resized by dragging their inner edge. The edge shows the accent colour on hover and while dragging.
- Each panel has a minimum and maximum width:
  - Side panel: default 260px, from 62 (icons only) to 600.
  - Tool panel: default 280px, from 200 to 720.
- **Side panel, down to icons only:** it resizes smoothly. The tool names are cut with "…" as it narrows, until only the icons are left; each name shows on hover. The rows keep the same height at every width.
- The width is remembered on that device (`localStorage`, key `spaternum.panelWidths`) and applies on every screen.
- A double-click on the edge resets it to the default.
- Maximums raised from 480 and 560, and the side panel allowed down to icons only, after Mihail tried it (2026-10-28). A first version snapped to icons below 180px; it felt too abrupt and changed the row spacing, so it was replaced by the smooth cut.
- The phone isn't affected: its panels slide over the content as before.

## Phone
- Narrow window = `max-width: 700px`. Sections go in the bottom bar. The side panel and tool panel slide over the content (85% wide, max 320px) with a dim backdrop. The slide is the only animation (0.2s).
- The app is padded clear of the status bar, navigation bar and keyboard (`MainActivity.kt`).

## Settings
**Decided and built 2026-10-28:**
- Settings is opened only from the **Home** screen. There's a gear at the top right of Home, on both PC and phone. On the phone it sits just left of the connection dot.
- The rail and the phone header no longer show a gear.
- The first start and a rejected token still open Settings by themselves.

## Gaps found in the code (all fixed 2026-10-28)
1. Settings gear on every screen → now on Home only. The header takes an `actions` slot, so Home puts the gear there.
2. Voice notes used `rem` → now `px` (17px Record button, 13px meta).
3. Tags looked different per tool → Voice notes now uses the `.tag` pill for its tags and its tag filter.
4. `#fff` written directly on Record and Stop → now the `--on-accent` token.
5. Two copies of the "selected" look → one shared `.on` class. Tags and Archive filters use it, in the "Shared pieces" section of `App.css`.

## Out of scope
- A theme switch (light/dark follows the system).
- Custom fonts, illustrations, animations beyond the drawer slide.
- Home screen content. Home stays a placeholder plus the Settings gear until its phase.

## Open questions
- **Name of the first section: Home or Dashboard?** Recommendation: **Home**. "Agile dashboard" is already a module ([[agile-dashboard_spec]]), so "Dashboard" would mean two things. It's also the word already used in the code and routes, and the bottom bar needs short words. Waiting for Mihail.

## Related
[[client-foundation_spec]] · [[PRD]] · [[TECH]] · [[tasks]] · [[notes_spec]] · [[voice-notes_spec]] · [[archive_spec]] · [[agile-dashboard_spec]]
