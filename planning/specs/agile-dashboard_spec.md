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

## Inputs and outputs
- **Input:** create, edit, move and delete cards; set or clear the blocked flag.
- **Output:** one board per project showing its cards grouped by column; card data stored on the server in tables owned by this module.
- **Depends on:** the project manager module, for the list of projects. Reads project IDs only, through that module's API, never its tables ([[2026-10-20-architecture-modular-monolith]]).
- **Connectivity:** online-only, like every module except voice notes ([[2026-10-20-offline-latest-write-wins]]).

## Acceptance criteria (done when…)
1. Opening a project shows its board with the six columns in the order above.
2. A card can be created, edited, moved to any column and deleted, on desktop and Android.
3. A card can be marked blocked and unblocked; blocked cards are visibly marked.
4. Every card shows its step and total duration in days (rules for edge cases: see open questions).
5. Cards belong to exactly one project; one project's board never shows another's cards.
6. Changes made on one device show up on the other after a refresh.
7. Tests for the module's API pass.

## Edge cases and failure modes
- Server unreachable → the board shows a clear error; no change is silently lost.
- Two devices edit the same card → latest write wins (`updated_at`).
- Project deleted while it still has cards → see open questions.
- Empty board → empty columns are still shown, so the flow is visible.

## Out of scope
- Custom, renamed or reordered columns.
- One global board across projects.
- Sprints, story points, burndown charts, WIP limits.
- Multiple users, assignees, permissions.
- AI features (come with the cross-module AI work).

## Open questions
- **Card fields:** beyond title, column and blocked flag — description (Markdown or plain text)? priority? due date? labels? a reason for being blocked?
- **Order within a column:** manual (drag to reorder) or automatic (e.g. by priority or date)?
- **Moving cards:** drag and drop on desktop; what on Android — drag, or a "move to…" menu?
- **Can a card skip columns** (e.g. Backlog → In Progress), or only move one step at a time?
- **Done cards:** stay forever, or get archived after a while?
- **Deleting a project with cards:** block the delete, delete the cards too, or archive them?
- **Durations — under a day:** show `0d`, or hours (`5h`)?
- **Durations — total starts when:** the card is created (enters Backlog), or when work starts (leaves Backlog/Analysis)?
- **Durations — Done cards:** do both times freeze when a card reaches Done?
- **Durations — moving back:** if a card goes back to a column it was in before, does the step time restart from zero or continue from before?
- **Durations — history:** store only when the card entered its current column (enough for the two numbers), or every move with its timestamp (allows per-column stats later, e.g. "average days in Review")?
- **Links to other modules:** should a card link to notes or voice notes from the start, or wait for the AI work?

## Related
[[PRD]] · [[TECH]] · [[tasks]] · [[2026-10-20-architecture-modular-monolith]] · [[2026-10-20-git-workflow]]
