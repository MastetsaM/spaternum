"""Apply <module>/migrations/NNN_*.sql in order, each once, each in its own transaction.

Run: uv run --env-file .env python -m spaternum.migrate
"""

import logging
from pathlib import Path

import psycopg

from spaternum import config, logs

log = logging.getLogger("spaternum.migrate")

PACKAGE = Path(__file__).parent
# Core first, then modules. Modules don't reference each other, so their order is free.
MODULES = ["core"]


def run(database_url: str, modules: list[str] = MODULES) -> list[str]:
    """Returns the files applied. A failing file rolls back and stops the run."""
    applied_now = []
    # autocommit: each conn.transaction() below is a real transaction, not a savepoint
    # inside one big transaction that a later failure would undo.
    with psycopg.connect(database_url, autocommit=True) as conn:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations ("
            " name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
        )
        done = {row[0] for row in conn.execute("SELECT name FROM schema_migrations")}

        for module in modules:
            for path in sorted((PACKAGE / module / "migrations").glob("*.sql")):
                name = f"{module}/{path.name}"
                if name in done:
                    continue
                with conn.transaction():
                    conn.execute(path.read_text())
                    conn.execute("INSERT INTO schema_migrations (name) VALUES (%s)", (name,))
                log.info("applied %s", name)
                applied_now.append(name)
    if not applied_now:
        log.info("nothing to apply")
    return applied_now


if __name__ == "__main__":
    settings = config.load()
    logs.setup(settings.log_level)
    run(settings.database_url)
