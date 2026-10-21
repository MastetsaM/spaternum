# Architecture: hub and spoke, modular monolith server

Decided 2026-10-17 in conversation with Mihail.

## Decision
One server is the single source of truth (data, API, later AI). PC and Android apps are thin interfaces. The server is one program with one folder per feature module; each module owns its tables and routes and doesn't reach into another's internals.

## Cross-module data (added 2026-10-21)
- A module **writes** only its own tables.
- Other modules **read** its data through its public Python functions (in-process, not HTTP) — e.g. the agile board calls `projects.get(project_id)`, never queries `projects` directly. The AI/RAG layer reads across modules the same way.
- On the clients, any screen may read another module's local synced collection; writes go only through the owning module's code.
- Modules reference each other **by ID only** (`card.project_id`); data is never copied between modules.
- **No foreign keys between modules** in Postgres (foreign keys inside a module are fine). Reasons: they'd tie module schemas together, and with offline sync a record can arrive before the one it points to. Code handles "not found"; archive-instead-of-delete keeps that rare.

## Shared Archive (added 2026-10-21)
- One **Archive page** in the client for everything archived, from every module, with a filter by type and a Restore button. Online only — archives are not stored on devices ([[2026-10-21-sync-rxdb]]).
- On the server, an **`archive` module that owns no tables**: `GET /archive` gathers items from each module's public `list_archived()`; `POST /archive/{module}/{id}/restore` calls that module's `restore(id)`.
- A module joins the Archive page by providing those two functions; nothing else changes.

## Why
- Mihail wants independent features that converge in one place.
- He prioritizes designs that are easy to understand, debug and change.
- Cross-module AI needs all data in one place.

## Alternatives considered
- **Microservices (one service per feature):** independent, but much harder to run, deploy and debug for one person.
- **Separate apps per feature:** no shared data, no cross-module AI.

## Consequences
- Easier: one deploy, one log, one database; modules can still be split out later thanks to clean boundaries.
- Harder: module boundaries are kept by discipline, not enforced by the network.

## Related
[[PRD]] · [[TECH]] · [[2026-10-21-sync-rxdb]] · [[agile-dashboard_spec]] · [[notes_spec]]
