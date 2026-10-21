# Spec — Server foundation (phase 1, block 1)

> **Draft (2026-10-21).** Open questions at the end need answers before coding.

## What and why
The shared base every server module builds on: the FastAPI app, settings, the API token check, a Postgres for development, the migration runner, the **sync helper** (pull/push endpoints for any synced table) and the **live update stream** (SSE). No feature tables yet — notes and voice notes come in their own blocks ([[tasks]]). Most of it is the sync spike's server, cleaned up and made reusable ([[sync-spike_spec]], [[2026-10-21-sync-rxdb]]).

## Layout
```
src/server/
  pyproject.toml, uv.lock
  spaternum/
    main.py        # creates the app, mounts each module's routes
    config.py      # reads settings from environment variables
    auth.py        # API token check
    db.py          # database connections
    migrate.py     # migration runner
    sync.py        # pull/push helper
    events.py      # SSE stream
    core/migrations/001_sync.sql   # shared pieces (the NOTIFY function)
    <module>/      # later: notes/, voice_notes/, archive/ — each with migrations/, routes, public functions
  tests/
ops/docker-compose.yml   # `db` service now; `api` added in block 2
```

## Behaviour

### Settings
Read from environment variables only: `DATABASE_URL`, `API_TOKEN`, `DATA_DIR`. Locally they come from `src/server/.env` (`uv run --env-file .env …`); in Docker from compose. Missing value → the server refuses to start with a clear message. `.env.example` is committed, `.env` never.

### API token
- Every route needs `Authorization: Bearer <token>` except `GET /health`.
- Compared in constant time (`secrets.compare_digest`).
- Wrong or missing → `401`.
- CORS allows any origin (the Tauri webview's origin differs per platform; the token is the real check) and **exposes the `Date` header**, so clients can read it to correct clock drift.

### Routes
- `GET /health` → `{"status": "ok"}`, plus whether the database answers.
- Module routes live under `/api/<module>/…`.

### Migrations
- Each module has `migrations/NNN_name.sql`. The runner applies every file not yet applied, in order (core first, then modules in a fixed list), each in its own transaction, and records it in `schema_migrations` as `<module>/NNN_name.sql`.
- A failed file rolls back and stops the run; nothing after it is applied.
- Run with `uv run python -m spaternum.migrate`; the Pi runs it as part of each update.
- Files are never edited once applied — changes go in a new file.

### Sync helper
A module describes a table once (name, columns, which columns are server-owned) and gets two endpoints:
- `GET /api/<module>/<table>/pull?seq=&limit=` → rows with `seq` greater than the checkpoint, in `seq` order, plus the new checkpoint. Archived rows are sent as `_deleted: true`.
- `POST /api/<module>/<table>/push` → for each document, latest `updated_at` wins (`INSERT … ON CONFLICT (id) DO UPDATE … WHERE excluded.updated_at > t.updated_at`), with a new `seq` on every write. Returns the server's row for every document it didn't take (RxDB's conflict format).
  - `_deleted: true` → the row is **archived**, not deleted: `archived_at` set to the server's current time. A module can add a hook that runs in the same transaction (notes uses it to archive a folder's contents).
  - A non-deleted document that wins over an archived row clears `archived_at` (a later edit brings it back — [[notes_spec]]).
  - Server-owned columns (e.g. `voice_notes.uploaded_at`) are never written by push.
- Timestamps go out in JavaScript's `toISOString()` format, so documents round-trip unchanged.

### Live update stream (SSE)
- `GET /api/events` — one stream for all synced tables. Each event names the table that changed; the client then tells that collection to pull (RxDB `RESYNC`). The `seq` pull still does the actual catching up, so a missed event costs nothing but a delay.
- Changes are announced by Postgres `NOTIFY`, fired by a **trigger** on each synced table — so every write announces itself, whether it came from push, a restore or an upload.
- A comment line every ~25 s keeps the connection alive through proxies and phone networks.

### Development database
`ops/docker-compose.yml` with one `db` service: image `pgvector/pgvector:0.8.7-pg18`, port bound to `127.0.0.1` only, data in a named volume. Tests use a separate database in the same container.

## Inputs and outputs
- **Input:** HTTP requests with the token; `.sql` migration files; environment variables.
- **Output:** JSON responses, an SSE stream, tables and `schema_migrations` in Postgres.

## Acceptance criteria (done when…)
1. `docker compose up -d db` starts Postgres; the server starts with `uv run` and `GET /health` reports the database as up.
2. A missing setting stops the server at start with a message naming it.
3. Any `/api/…` route without the right token answers `401`; `/health` doesn't need it.
4. The migration runner applies new files once, in order; running it again changes nothing; a broken file rolls back and stops the run.
5. Through a test table, the sync helper:
   - pulls in `seq` order with a working checkpoint, including an old offline edit pushed late;
   - keeps the later `updated_at` on conflict and returns the server row for the loser;
   - archives on `_deleted: true` (row kept, `archived_at` set, pulled back as `_deleted: true`);
   - un-archives on a later non-deleted push;
   - never overwrites a server-owned column.
6. A write to a synced table produces an SSE event naming that table within a second.
7. The `Date` header is readable from a browser (exposed through CORS).
8. All of the above are covered by pytest tests against a real Postgres, and they pass.

## Edge cases and failure modes
- Database down at start → the server still starts; `/health` reports the database as down; API calls answer `503`.
- Database restarts while an SSE stream is open → the stream ends; the client reconnects (RxDB pull stream handles it) and the `seq` pull catches up.
- Push with a malformed document → `422` for the whole batch, nothing written.
- Push of a document whose `updated_at` equals the server's → server keeps its row (the rule is "strictly later wins").
- Very large pull → capped by `limit` (default 100, max 1000).

## Out of scope
- Notes, voice notes and archive tables and routes (blocks 3–5).
- Docker image for the server, `install.sh`, backups (block 2).
- A connection pool, logging setup, metrics.
- Rate limiting — single user over Tailscale.

## Open questions
1. **Database connections:** a new connection per request (what the spike did — simplest, fast enough for one user), or a connection pool (`psycopg_pool`, one more package)? *Recommendation: per request now*, add a pool only if the Pi shows it's slow.
2. **Test packages:** pytest and httpx (FastAPI's test client needs httpx) as development-only dependencies — latest versions at install time, logged in `wiki/installed.md`. OK?
3. **NOTIFY by trigger** (above) or by the server code after each write? *Recommendation: trigger* — can't be forgotten by a module; costs one line of SQL per synced table.
4. **One SSE stream for all tables** (above) or one per table? *Recommendation: one* — fewer open connections from the phone; the client routes events by table name.

## Related
[[tasks]] · [[TECH]] · [[PRD]] · [[sync-spike_spec]] · [[notes_spec]] · [[voice-notes_spec]] · [[2026-10-21-sync-rxdb]] · [[2026-10-21-database-access-plain-sql]] · [[2026-10-20-auth-tailscale-api-token]] · [[2026-10-20-architecture-modular-monolith]] · [[2026-10-20-git-workflow]]
