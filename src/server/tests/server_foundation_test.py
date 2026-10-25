"""Acceptance criteria of planning/specs/server-foundation_spec.md."""

import os
import socket
import threading
import time
import uuid

import httpx
import psycopg
import pytest
import uvicorn
from fastapi.testclient import TestClient

from conftest import TEST_URL, archived_ids
from spaternum import config, db, migrate

TOKEN = os.environ["API_TOKEN"]


def doc(text="hello", updated="2026-10-21T10:00:00.000Z", **extra):
    return {
        "id": extra.pop("id", str(uuid.uuid4())),
        "text": text,
        "created_at": "2026-10-21T09:00:00.000Z",
        "updated_at": updated,
        "_deleted": False,
        **extra,
    }


def push(client, *docs):
    response = client.post("/api/test_items/push", json=list(docs))
    assert response.status_code == 200, response.text
    return response.json()


def pull(client, seq=0, limit=100):
    response = client.get(f"/api/test_items/pull?seq={seq}&limit={limit}")
    assert response.status_code == 200, response.text
    return response.json()


# --- Settings, health, token -------------------------------------------------


def test_missing_setting_stops_start(monkeypatch):
    monkeypatch.delenv("API_TOKEN")
    with pytest.raises(SystemExit, match="API_TOKEN"):
        config.load()


def test_health_reports_database_up(client):
    response = client.get("/health", headers={"Authorization": ""})
    assert response.json() == {"status": "ok", "database": "up"}


def test_api_needs_the_token(client):
    assert client.get("/api/test_items/pull", headers={"Authorization": ""}).status_code == 401
    wrong = {"Authorization": "Bearer wrong"}
    assert client.get("/api/test_items/pull", headers=wrong).status_code == 401
    assert client.get("/api/test_items/pull").status_code == 200


def test_database_down(monkeypatch):
    from spaternum.main import create_app
    from conftest import TABLE
    from spaternum import sync

    monkeypatch.setenv("DATABASE_URL", "postgresql://nobody@127.0.0.1:1/none")
    monkeypatch.setattr(db, "TIMEOUT", 0.5)
    app = create_app((sync.router(TABLE),))
    with TestClient(app, headers={"Authorization": f"Bearer {TOKEN}"}) as c:
        assert c.get("/health").json()["database"] == "down"
        assert c.get("/api/test_items/pull").status_code == 503


# --- Logging ------------------------------------------------------------------


def test_requests_are_logged_without_the_token(client, caplog):
    caplog.set_level("INFO")
    client.get("/api/test_items/pull?seq=0")
    push(client, doc())
    assert "GET /api/test_items/pull 200" in caplog.text
    assert "push test_items: 1 docs, 0 conflicts" in caplog.text
    assert TOKEN not in caplog.text


# --- Migrations ---------------------------------------------------------------


def test_migrations_apply_once():
    assert migrate.run(TEST_URL) == []  # core already applied by the session fixture
    with psycopg.connect(TEST_URL) as conn:
        names = [r[0] for r in conn.execute("SELECT name FROM schema_migrations")]
    assert names[0] == "core/001_sync.sql" and "notes/001_notes.sql" in names


def test_broken_migration_rolls_back_and_stops(tmp_path, monkeypatch):
    folder = tmp_path / "broken" / "migrations"
    folder.mkdir(parents=True)
    (folder / "001_ok.sql").write_text("CREATE TABLE broken_ok (id int);")
    (folder / "002_bad.sql").write_text("CREATE TABLE broken_bad (id int); SELECT nonsense;")
    (folder / "003_after.sql").write_text("CREATE TABLE broken_after (id int);")
    monkeypatch.setattr(migrate, "PACKAGE", tmp_path)

    with pytest.raises(psycopg.errors.UndefinedColumn):
        migrate.run(TEST_URL, modules=["broken"])

    with psycopg.connect(TEST_URL) as conn:
        tables = {
            r[0]
            for r in conn.execute(
                "SELECT tablename FROM pg_tables WHERE tablename LIKE 'broken_%'"
            )
        }
        names = {r[0] for r in conn.execute("SELECT name FROM schema_migrations")}
        conn.execute("DROP TABLE broken_ok")
        conn.execute("DELETE FROM schema_migrations WHERE name LIKE 'broken/%'")
    assert tables == {"broken_ok"}
    assert "broken/001_ok.sql" in names and "broken/002_bad.sql" not in names


# --- Sync helper --------------------------------------------------------------


def test_pull_in_seq_order_with_checkpoint(client):
    a, b, c = doc("a"), doc("b"), doc("c")
    push(client, a, b)
    first = pull(client, limit=1)
    assert [d["text"] for d in first["documents"]] == ["a"]
    rest = pull(client, seq=first["checkpoint"]["seq"])
    assert [d["text"] for d in rest["documents"]] == ["b"]

    push(client, c)
    newer = pull(client, seq=rest["checkpoint"]["seq"])
    assert [d["text"] for d in newer["documents"]] == ["c"]
    assert newer["documents"][0]["created_at"] == "2026-10-21T09:00:00.000Z"  # round-trips


def test_old_offline_edit_pushed_late_is_still_pulled(client):
    item = doc("v1", updated="2026-10-21T10:00:00.000Z")
    push(client, item)
    checkpoint = pull(client)["checkpoint"]["seq"]  # the PC is up to date
    # The phone edited at 11:00 while offline and pushes now
    push(client, {**item, "text": "v2", "updated_at": "2026-10-21T11:00:00.000Z"})
    assert [d["text"] for d in pull(client, seq=checkpoint)["documents"]] == ["v2"]


def test_later_edit_wins_and_loser_gets_server_row(client):
    item = doc("later", updated="2026-10-21T12:00:00.000Z")
    push(client, item)
    conflicts = push(client, {**item, "text": "older", "updated_at": "2026-10-21T11:00:00.000Z"})
    assert [c["text"] for c in conflicts] == ["later"]
    same_time = push(client, {**item, "text": "same"})  # equal updated_at: server keeps its row
    assert [c["text"] for c in same_time] == ["later"]


def test_deleted_archives_and_later_edit_restores(client, db):
    item = doc("x")
    push(client, item)
    push(client, {**item, "_deleted": True, "updated_at": "2026-10-21T11:00:00.000Z"})

    row = db.execute("SELECT archived_at FROM test_items WHERE id = %s", (item["id"],)).fetchone()
    assert row[0] is not None  # kept, archived
    assert archived_ids == [uuid.UUID(item["id"])]  # module hook ran
    assert pull(client)["documents"][0]["_deleted"] is True

    push(client, {**item, "text": "back", "updated_at": "2026-10-21T12:00:00.000Z"})
    row = db.execute("SELECT archived_at, text FROM test_items WHERE id = %s", (item["id"],)).fetchone()
    assert row == (None, "back")


def test_server_owned_column_is_never_written_by_push(client, db):
    item = doc()
    push(client, {**item, "uploaded_at": "2026-10-21T10:00:00.000Z"})
    assert db.execute("SELECT uploaded_at FROM test_items").fetchone()[0] is None

    db.execute("UPDATE test_items SET uploaded_at = now()")
    push(client, {**item, "text": "edit", "updated_at": "2026-10-21T13:00:00.000Z", "uploaded_at": None})
    assert db.execute("SELECT uploaded_at FROM test_items").fetchone()[0] is not None


def test_malformed_push_writes_nothing(client, db):
    response = client.post("/api/test_items/push", json=[doc(), {"id": "not-a-uuid"}])
    assert response.status_code == 422
    assert db.execute("SELECT count(*) FROM test_items").fetchone()[0] == 0


def test_pull_limit_is_capped(client):
    assert client.get("/api/test_items/pull?limit=1001").status_code == 422


# --- SSE stream ---------------------------------------------------------------


@pytest.fixture
def live_server(app, db):
    """A real server in a thread: TestClient can't read an endless stream."""
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(app, port=port, log_level="warning"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    while not server.started:
        time.sleep(0.05)
    yield f"http://127.0.0.1:{port}"
    server.should_exit = True
    thread.join(timeout=5)


def test_date_header_is_readable_from_a_browser(live_server):
    # The Date header comes from uvicorn, so this needs the real server
    response = httpx.get(f"{live_server}/health", headers={"Origin": "tauri://localhost"})
    assert "date" in response.headers
    assert "date" in response.headers["access-control-expose-headers"].lower()


def test_write_produces_an_event_within_a_second(live_server):
    headers = {"Authorization": f"Bearer {TOKEN}"}
    with httpx.Client(base_url=live_server, headers=headers, timeout=5) as http:
        with http.stream("GET", "/api/events") as stream:
            lines = stream.iter_lines()
            assert next(lines) == ": connected"
            start = time.monotonic()
            http.post("/api/test_items/push", json=[doc()])
            for line in lines:
                if line.startswith("data:"):
                    break
            assert line == "data: test_items"
            assert time.monotonic() - start < 1
