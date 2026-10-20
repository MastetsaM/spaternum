# Database access: plain SQL with psycopg, own migration script

Decided 2026-10-21 in conversation with Mihail.

## Decision
- **Queries:** plain SQL through psycopg 3. Rows map onto Pydantic models with `class_row`. Each module keeps its own queries and never touches another module's tables ([[2026-10-20-architecture-modular-monolith]]).
- **Migrations:** numbered `.sql` files (`001_notes.sql`, `002_voice_notes.sql`, …), applied in order by a small script of our own (~30 lines). It records applied files in a `schema_migrations` table and runs each new file in a transaction. Forward-only: a bad migration is fixed with a new file; `pg_dump` backups are the safety net.
- **No ORM.** SQLAlchemy is not used.

## Why
- Mihail is comfortable with SQL; an ORM would mostly hide SQL he can already write, behind rules (sessions, flushing, lazy loading) that make bugs harder to see.
- The data is small and simple: one user, a handful of tables, few relationships. An ORM pays off with many tables and joins.
- The hard queries are SQL either way:
  - Latest-write-wins sync ([[2026-10-20-offline-latest-write-wins]]) is one statement: `INSERT … ON CONFLICT (id) DO UPDATE … WHERE excluded.updated_at > notes.updated_at`.
  - Vector search (RAG phase) is `ORDER BY embedding <=> $1 LIMIT 5`.
- What you read is what runs; debugging = paste the query into `psql`. One description of each table, not a model plus a schema.

## Alternatives considered
- **SQLAlchemy 2 ORM + Alembic:** less hand-written create/read/update/delete code, migrations generated automatically, standard in FastAPI tutorials. Rejected: a thick layer with its own rules, two descriptions of every table (model + Pydantic schema), and the sync upsert is awkward through it.
- **SQLAlchemy Core (query builder only):** still means learning SQLAlchemy's API, without the ORM's convenience.
- **dbmate for migrations:** rollbacks and locking built in. Rejected for now: one more binary in Docker and on the PC, and rollbacks/locking aren't needed with one server and one user.

## Consequences
- Easier: debugging, reading the code, the sync upsert and vector queries, fewer dependencies.
- Harder: repetitive create/read/update/delete SQL is written by hand; migrations are hand-written; SQL typos only show up at runtime, so every query needs a test.

## Revisit when…
These can change later without touching the database schema — only the Python code around it:
- **Move to an ORM (SQLAlchemy)** if the data model grows many tables with many relationships, or hand-written repetitive queries become real busywork.
- **Move to dbmate** if rollbacks or migration locking become necessary (e.g. more than one server). Cheap: its files are plain SQL with `-- migrate:up` / `-- migrate:down` markers added.

## Related
[[TECH]] · [[PRD]] · [[tasks]] · [[2026-10-20-database-postgres-pgvector]] · [[2026-10-20-offline-latest-write-wins]] · [[learn-sqlalchemy]]
