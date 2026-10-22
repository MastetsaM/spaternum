"""Connection pool. Opened at start without waiting, so the server runs even if Postgres is down."""

from collections.abc import Iterator

from fastapi import Request
from psycopg import Connection
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

TIMEOUT = 5  # seconds to wait for a connection before answering 503


def open_pool(database_url: str) -> ConnectionPool:
    pool = ConnectionPool(
        database_url,
        min_size=1,
        max_size=10,
        kwargs={"row_factory": dict_row},
        check=ConnectionPool.check_connection,  # drop dead connections after a Postgres restart
        open=False,
    )
    pool.open(wait=False)
    return pool


def get_conn(request: Request) -> Iterator[Connection]:
    """FastAPI dependency: one connection per request, committed when the request ends."""
    with request.app.state.pool.connection(timeout=TIMEOUT) as conn:
        yield conn
