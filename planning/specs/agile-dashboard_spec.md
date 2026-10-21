# Spec — Agile dashboard (phase 4)

## What and why
A kanban board for tracking work. Each project in the project manager module has its own board, and every card belongs to one project. It's the agile dashboard module from [[PRD]] phase 4. It's specced now but built after the project manager, because boards hang off projects.

Why a module and not an existing tool: the board's data lives on the same server as notes, voice notes and clients, so the later cross-module AI can connect a card to the notes and conversations about it.

## Columns
Fixed, in this order:

| Column | Meaning |
|---|---|
| Backlog | Raw ideas, not looked at yet |
| Analysis | Being clarified or specced |
| Ready | Clear enough to start |
| In Progress | Being built |
| Review | Built, being tested — matches the "merge only when tests pass" rule in [[2026-10-20-git-workflow]] |
| Done | Finished |

**Blocked** is a flag on a card, not a column. A blocked card stays in its column so the board still shows where it is in the flow.

## Durations
Each card shows two times, in whole days (e.g. `1d`, `57d`):
- **Step:** how long it has been in its current column.
- **Total:** how long it has been on the board overall.

Shows at a glance which cards are stuck and how long work takes end to end.

## Order within a column
Automatic, no manual reordering:
1. Closest due date first.
2. Then by total duration (see open questions for direction and for cards without a due date).

## Moving cards
- Any column to any column — skipping is allowed (e.g. Backlog → In Progress).
- Desktop: drag and drop.
- Android: long-press, then drag (a plain drag would clash with scrolling the board).

## Comments
Each card has a list of comments, for taking notes on the topic as it moves along. Comments live in this module's own tables, not in the notes module.

## Archiving
Nothing is deleted — things are archived.
- **Cards:** an Archive button on the card. Archived cards leave the board but stay stored.
- **Projects:** a project is archived, never deleted; its board and cards are archived with it.
- Archived cards are viewed and restored on the app's **shared Archive page** — the module provides `list_archived()` and `restore(id)` ([[2026-10-20-architecture-modular-monolith]]).

## Inputs and outputs
- **Input:** create, edit, move and archive cards; set or clear the blocked flag; set a due date; add comments.
- **Output:** one board per project showing its cards grouped by column; card data stored on the server in tables owned by this module.
- **Depends on:** the project manager module, for the list of projects. Reads project IDs only, through that module's API, never its tables ([[2026-10-20-architecture-modular-monolith]]).
- **Connectivity:** online-only, like every module except voice notes ([[2026-10-20-offline-latest-write-wins]]).

## Acceptance criteria (done when…)
1. Opening a project shows its board with the six columns in the order above.
2. A card can be created, edited, moved to any column and archived, on desktop and Android.
3. A card can be marked blocked and unblocked; blocked cards are visibly marked.
4. Every card shows its step and total duration in days (rules for edge cases: see open questions).
5. Cards in each column are ordered by due date, then total duration.
6. Comments can be added to a card and are shown on it.
7. Archiving a project hides its board; nothing is deleted from the database.
8. Cards belong to exactly one project; one project's board never shows another's cards.
9. Changes made on one device show up on the other after a refresh.
10. Tests for the module's API pass.

## Edge cases and failure modes
- Server unreachable → the board shows a clear error; no change is silently lost.
- Two devices edit the same card → latest write wins (`updated_at`).
- Empty board → empty columns are still shown, so the flow is visible.
- Due date in the past → see open questions.

## Out of scope
- Custom, renamed or reordered columns.
- Manual ordering of cards within a column.
- Deleting cards or projects.
- One global board across projects.
- Sprints, story points, burndown charts, WIP limits.
- Multiple users, assignees, permissions.
- Linking cards to the notes or voice notes modules (comments cover note-taking for now).
- AI features (come with the cross-module AI work).

## Open questions
- **Card fields:** title, column, blocked flag and due date are in. Also: description (Markdown or plain text)? priority? labels? a reason for being blocked?
- **Ordering — second key:** longest total duration first (oldest work surfaces) or shortest first?
- **Ordering — no due date:** do cards without a due date go below all dated ones?
- **Overdue cards:** highlighted in some way?
- **Comments:** Markdown or plain text? Can a comment be edited after posting?
- **Durations — under a day:** show `0d`, or hours (`5h`)?
- **Durations — total starts when:** the card is created (enters Backlog), or when work starts (leaves Backlog/Analysis)?
- **Durations — Done cards:** do both times freeze when a card reaches Done?
- **Durations — moving back:** if a card goes back to a column it was in before, does the step time restart from zero or continue from before?
- **Durations — history:** store only when the card entered its current column (enough for the two numbers), or every move with its timestamp (allows per-column stats later, e.g. "average days in Review")?

## Related
[[PRD]] · [[TECH]] · [[tasks]] · [[2026-10-20-architecture-modular-monolith]] · [[2026-10-20-git-workflow]]
