"""Server side of planning/specs/notes-recordings_spec.md (audio rules from voice-notes_spec.md)."""

import asyncio
import dataclasses
import uuid
from pathlib import Path

import psycopg
import pytest
from psycopg.rows import dict_row

from conftest import BASE_URL, TEST_URL
from notes_test import archive, archived, folder, note, pull, push
from spaternum import migrate, notes
from spaternum.notes import audio

AUDIO = b"\x1aE\xdf\xa3" + b"opus" * 1000  # stands in for a webm file


def recording(note_id, size=len(AUDIO), updated="2026-10-25T10:00:00.000Z", **extra):
    return {
        "id": extra.pop("id", str(uuid.uuid4())),
        "note_id": note_id,
        "recorded_at": extra.pop("recorded_at", "2026-10-25T09:58:00.000Z"),
        "duration_ms": 120000,
        "size_bytes": size,
        "mime_type": "audio/webm;codecs=opus",
        "created_at": "2026-10-25T10:00:00.000Z",
        "updated_at": updated,
        "_deleted": False,
        **extra,
    }


@pytest.fixture
def rec_db(db):
    with psycopg.connect(TEST_URL, autocommit=True, row_factory=dict_row) as conn:
        conn.execute("TRUNCATE note_folders, notes, note_recordings")
        yield conn


@pytest.fixture
def data_dir(client, tmp_path):
    """Audio goes to a temp folder, not the dev data folder."""
    settings = client.app.state.settings
    client.app.state.settings = dataclasses.replace(settings, data_dir=tmp_path)
    yield tmp_path / "audio"
    client.app.state.settings = settings


def upload(client, id, content=AUDIO):
    return client.put(f"/api/notes/recordings/{id}/audio", content=content)


def note_with_recording(client, body="", **note_extra):
    n = note(body, **note_extra)
    r = recording(n["id"])
    push(client, "notes", n)
    push(client, "note_recordings", r)
    return n, r


# --- Sync and audio (voice notes criteria, now on recordings) ---


def test_recording_round_trips_with_its_note(client, rec_db):
    n, r = note_with_recording(client)
    doc = pull(client, "note_recordings")["documents"][0]
    assert (doc["note_id"], doc["duration_ms"], doc["uploaded_at"]) == (n["id"], 120000, None)


def test_recording_can_arrive_before_its_note(client, rec_db):
    n = note("")
    push(client, "note_recordings", recording(n["id"]))
    push(client, "notes", n)
    assert len(pull(client, "note_recordings")["documents"]) == 1


def test_upload_stores_the_file_and_marks_it_uploaded(client, rec_db, data_dir):
    _, r = note_with_recording(client)
    checkpoint = pull(client, "note_recordings")["checkpoint"]["seq"]

    assert upload(client, r["id"]).status_code == 200
    assert (data_dir / f"{r['id']}.webm").read_bytes() == AUDIO
    doc = pull(client, "note_recordings", seq=checkpoint)["documents"][0]
    assert doc["uploaded_at"] is not None
    assert doc["updated_at"] == r["updated_at"]  # the device's edit time is untouched


def test_device_cannot_reset_uploaded(client, rec_db, data_dir):
    _, r = note_with_recording(client)
    upload(client, r["id"])
    push(client, "note_recordings",
         {**r, "duration_ms": 1, "updated_at": "2026-10-25T11:00:00.000Z", "uploaded_at": None})
    row = rec_db.execute("SELECT duration_ms, uploaded_at FROM note_recordings").fetchone()
    assert row["duration_ms"] == 1 and row["uploaded_at"] is not None


def test_upload_twice_changes_nothing(client, rec_db, data_dir):
    _, r = note_with_recording(client)
    upload(client, r["id"])
    first = rec_db.execute("SELECT uploaded_at, seq FROM note_recordings").fetchone()
    response = upload(client, r["id"])
    assert response.status_code == 200 and response.json()["status"] == "already uploaded"
    assert rec_db.execute("SELECT uploaded_at, seq FROM note_recordings").fetchone() == first


def test_upload_before_metadata_is_404(client, rec_db, data_dir):
    assert upload(client, uuid.uuid4()).status_code == 404


def test_size_mismatch_is_refused_and_leaves_nothing(client, rec_db, data_dir):
    n = note("")
    push(client, "notes", n)
    small, big = recording(n["id"], size=len(AUDIO) + 1), recording(n["id"], size=10)
    push(client, "note_recordings", small, big)
    assert upload(client, small["id"]).status_code == 400
    assert upload(client, big["id"]).status_code == 400
    assert list(data_dir.iterdir()) == []
    uploaded = rec_db.execute(
        "SELECT count(*) AS n FROM note_recordings WHERE uploaded_at IS NOT NULL"
    ).fetchone()["n"]
    assert uploaded == 0


def test_interrupted_upload_leaves_no_file(tmp_path):
    async def chunks_then_disconnect():
        yield AUDIO[:100]
        raise ConnectionResetError("client went away")

    target = tmp_path / "audio" / "x.webm"
    with pytest.raises(ConnectionResetError):
        asyncio.run(audio.save_upload(chunks_then_disconnect(), target, len(AUDIO)))
    assert list(target.parent.iterdir()) == []


def test_streaming_supports_seeking(client, rec_db, data_dir):
    _, r = note_with_recording(client)
    url = f"/api/notes/recordings/{r['id']}/audio"
    assert client.get(url).status_code == 404  # not uploaded yet
    upload(client, r["id"])

    whole = client.get(url)
    assert whole.status_code == 200 and whole.content == AUDIO
    part = client.get(url, headers={"Range": "bytes=4-7"})
    assert part.status_code == 206 and part.content == b"opus"


# --- Archive and restore ---


def test_archiving_a_note_archives_its_recordings_and_restore_brings_them_back(
    client, rec_db, data_dir
):
    n, r = note_with_recording(client)
    upload(client, r["id"])
    archive(client, "notes", n)

    assert archived(rec_db, "note_recordings", r["id"]) == archived(rec_db, "notes", n["id"])
    assert (data_dir / f"{r['id']}.webm").exists()  # the file stays
    assert notes.restore(rec_db, uuid.UUID(n["id"])) is True
    assert archived(rec_db, "note_recordings", r["id"]) is None


def test_archiving_a_folder_archives_the_recordings_inside(client, rec_db):
    f = folder("Work")
    push(client, "note_folders", f)
    n, r = note_with_recording(client, folder_id=f["id"])
    archive(client, "note_folders", f)
    assert archived(rec_db, "note_recordings", r["id"]) == archived(rec_db, "note_folders", f["id"])

    notes.restore(rec_db, uuid.UUID(f["id"]))
    assert archived(rec_db, "note_recordings", r["id"]) is None


def test_recording_archived_on_its_own_stays_archived_when_the_note_is_restored(client, rec_db):
    n, first = note_with_recording(client)
    second = recording(n["id"])
    push(client, "note_recordings", second)
    archive(client, "note_recordings", first)
    archive(client, "notes", n, updated="2026-10-25T12:00:00.000Z")

    notes.restore(rec_db, uuid.UUID(n["id"]))
    assert archived(rec_db, "note_recordings", first["id"]) is not None
    assert archived(rec_db, "note_recordings", second["id"]) is None


def test_archiving_one_recording_leaves_its_note(client, rec_db):
    n, r = note_with_recording(client, body="Keep me")
    archive(client, "note_recordings", r)
    assert archived(rec_db, "notes", n["id"]) is None

    items = notes.list_archived(rec_db)
    assert [(i["type"], i["title"]) for i in items] == [("recording", "Keep me")]


def test_restoring_a_recording_restores_its_archived_note(client, rec_db):
    n, r = note_with_recording(client)
    archive(client, "note_recordings", r)
    archive(client, "notes", n, updated="2026-10-25T12:00:00.000Z")

    assert notes.restore(rec_db, uuid.UUID(r["id"])) is True
    assert archived(rec_db, "notes", n["id"]) is None
    assert archived(rec_db, "note_recordings", r["id"]) is None
    assert notes.restore(rec_db, uuid.UUID(r["id"])) is False


def test_untitled_archived_note_is_named_by_its_first_recording(client, rec_db):
    n = note("")
    push(client, "notes", n)
    push(client, "note_recordings",
         recording(n["id"], recorded_at="2026-10-25T09:30:00.000Z"),
         recording(n["id"], recorded_at="2026-10-25T09:00:00.000Z"))
    archive(client, "notes", n)

    [item] = notes.list_archived(rec_db)
    assert (item["type"], item["title"], item["recorded_at"].isoformat()) == (
        "note", "", "2026-10-25T09:00:00+00:00"
    )


def test_note_archived_with_its_recordings_is_one_entry(client, rec_db):
    n, _ = note_with_recording(client, body="Call")
    archive(client, "notes", n)
    assert [(i["type"], i["title"]) for i in notes.list_archived(rec_db)] == [("note", "Call")]


# --- Migration from voice notes ---

# The voice_notes table as the Pi has it before notes/003 (voice_notes/001, removed since)
OLD_VOICE_NOTES = """
CREATE SEQUENCE voice_notes_seq;
CREATE TABLE voice_notes (
    id uuid PRIMARY KEY, title text NOT NULL DEFAULT '', tags text[] NOT NULL DEFAULT '{}',
    recorded_at timestamptz NOT NULL, duration_ms integer NOT NULL, size_bytes bigint NOT NULL,
    mime_type text NOT NULL, uploaded_at timestamptz, created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL, archived_at timestamptz, seq bigint NOT NULL
);
"""

MIGRATIONS = Path(migrate.__file__).parent


@pytest.fixture
def old_db():
    """A database at the state before notes/003: notes 001-002 and the old voice_notes table."""
    url = BASE_URL.rsplit("/", 1)[0] + "/spaternum_migration_test"
    with psycopg.connect(BASE_URL, autocommit=True) as conn:
        conn.execute("DROP DATABASE IF EXISTS spaternum_migration_test")
        conn.execute("CREATE DATABASE spaternum_migration_test")
    with psycopg.connect(url, autocommit=True, row_factory=dict_row) as conn:
        for path in [
            *sorted((MIGRATIONS / "core" / "migrations").glob("*.sql")),
            MIGRATIONS / "notes" / "migrations" / "001_notes.sql",
            MIGRATIONS / "notes" / "migrations" / "002_note_title.sql",
        ]:
            conn.execute(path.read_text())
        conn.execute(OLD_VOICE_NOTES)
        yield conn
    with psycopg.connect(BASE_URL, autocommit=True) as conn:
        conn.execute("DROP DATABASE spaternum_migration_test")


def run_003(conn):
    conn.execute((MIGRATIONS / "notes" / "migrations" / "003_note_recordings.sql").read_text())


def add_voice_note(conn, title="", tags=(), archived_at=None, uploaded=True):
    id = uuid.uuid4()
    conn.execute(
        """
        INSERT INTO voice_notes (id, title, tags, recorded_at, duration_ms, size_bytes, mime_type,
                                 uploaded_at, created_at, updated_at, archived_at, seq)
        VALUES (%s, %s, %s, '2026-10-25T09:58Z', 120000, 4004, 'audio/webm;codecs=opus',
                %s, '2026-10-25T10:00Z', '2026-10-25T10:05Z', %s, nextval('voice_notes_seq'))
        """,
        (id, title, list(tags), "2026-10-25T10:01Z" if uploaded else None, archived_at),
    )
    return id


def test_migration_turns_voice_notes_into_notes_in_a_folder(old_db):
    call = add_voice_note(old_db, title="Call with X", tags=["work"])
    gone = add_voice_note(old_db, archived_at="2026-10-26T08:00Z", uploaded=False)
    run_003(old_db)

    [f] = old_db.execute("SELECT id, name, parent_id, archived_at FROM note_folders").fetchall()
    assert (f["name"], f["parent_id"], f["archived_at"]) == ("Voice notes", None, None)

    rows = old_db.execute(
        """
        SELECT r.id, r.uploaded_at IS NOT NULL AS uploaded, r.archived_at AS r_archived,
               n.title, n.body, n.tags, n.folder_id, n.archived_at AS n_archived,
               n.updated_at, r.updated_at AS r_updated
        FROM note_recordings r JOIN notes n ON n.id = r.note_id
        """
    ).fetchall()
    by_id = {r["id"]: r for r in rows}
    assert len(rows) == 2  # nothing lost, one note each
    assert (by_id[call]["title"], by_id[call]["tags"], by_id[call]["body"]) == (
        "Call with X", ["work"], ""
    )
    assert all(r["folder_id"] == f["id"] for r in rows)
    assert by_id[call]["uploaded"] and not by_id[gone]["uploaded"]
    # The archived voice note: note and recording archived together, so they restore together
    assert by_id[gone]["n_archived"] == by_id[gone]["r_archived"] is not None
    assert by_id[call]["updated_at"] == by_id[call]["r_updated"]
    assert old_db.execute("SELECT to_regclass('voice_notes') AS t").fetchone()["t"] is None

    assert notes.restore(old_db, by_id[gone]["id"]) is True  # through the recording
    assert old_db.execute(
        "SELECT count(*) AS n FROM notes WHERE archived_at IS NOT NULL"
    ).fetchone()["n"] == 0


def test_migration_without_voice_notes_adds_no_folder(old_db):
    run_003(old_db)
    assert old_db.execute("SELECT count(*) AS n FROM note_folders").fetchone()["n"] == 0
    assert old_db.execute("SELECT to_regclass('voice_notes') AS t").fetchone()["t"] is None


def test_migration_on_a_fresh_database(old_db):
    old_db.execute("DROP TABLE voice_notes; DROP SEQUENCE voice_notes_seq")
    run_003(old_db)
    assert old_db.execute("SELECT to_regclass('note_recordings') AS t").fetchone()["t"] is not None
