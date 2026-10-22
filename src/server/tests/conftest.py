"""Tests run against a real Postgres: the dev container, database `spaternum_test`.

Run: uv run --env-file .env pytest
"""

import os
from datetime import datetime
from uuid import UUID

import psycopg
import pytest
from fastapi.testclient import TestClient

from spaternum import migrate, sync

BASE_URL = os.environ["DATABASE_URL"]
TEST_URL = BASE_URL.rsplit("/", 1)[0] + "/spaternum_test"
os.environ["DATABASE_URL"] = TEST_URL


class Item(sync.SyncDoc):
    text: str
    uploaded_at: datetime | None = None


archived_ids: list[UUID] = []


def remember_archive(conn, id, archived_at):
    archived_ids.append(id)


TABLE = sync.SyncTable(
    "test_items", Item, server_owned=["uploaded_at"], on_archive=remember_archive
)

TABLE_SQL = """
CREATE SEQUENCE test_items_seq;
CREATE TABLE test_items (
    id          uuid PRIMARY KEY,
    text        text NOT NULL,
    uploaded_at timestamptz,
    created_at  timestamptz NOT NULL,
    updated_at  timestamptz NOT NULL,
    archived_at timestamptz,
    seq         bigint NOT NULL
);
CREATE TRIGGER test_items_notify AFTER INSERT OR UPDATE ON test_items
    FOR EACH STATEMENT EXECUTE FUNCTION sync_notify();
"""


@pytest.fixture(scope="session", autouse=True)
def database():
    """Fresh test database for the session: core migrations plus the test table."""
    with psycopg.connect(BASE_URL, autocommit=True) as conn:
        exists = conn.execute(
            "SELECT 1 FROM pg_database WHERE datname = 'spaternum_test'"
        ).fetchone()
        if not exists:
            conn.execute("CREATE DATABASE spaternum_test")
    with psycopg.connect(TEST_URL, autocommit=True) as conn:
        conn.execute("DROP SCHEMA public CASCADE")
        conn.execute("CREATE SCHEMA public")
    migrate.run(TEST_URL)
    with psycopg.connect(TEST_URL) as conn:
        conn.execute(TABLE_SQL)


@pytest.fixture
def db():
    with psycopg.connect(TEST_URL, autocommit=True) as conn:
        conn.execute("TRUNCATE test_items")
        archived_ids.clear()
        yield conn


@pytest.fixture
def app():
    from spaternum.main import create_app

    return create_app((sync.router(TABLE),))


@pytest.fixture
def client(app, db):
    token = os.environ["API_TOKEN"]
    with TestClient(app, headers={"Authorization": f"Bearer {token}"}) as c:
        yield c
