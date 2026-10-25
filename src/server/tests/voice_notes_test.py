"""Server side of planning/specs/voice-notes_spec.md."""

import asyncio
import dataclasses
import uuid

import psycopg
import pytest
from psycopg.rows import dict_row

from conftest import TEST_URL
from spaternum import voice_notes
from spaternum.voice_notes import audio

AUDIO = b"\x1aE\xdf\xa3" + b"opus" * 1000  # stands in for a webm file


def voice_note(size=len(AUDIO), updated="2026-10-25T10:00:00.000Z", **extra):
    return {
        "id": extra.pop("id", str(uuid.uuid4())),
        "title": "",
        "tags": [],
        "recorded_at": "2026-10-25T09:58:00.000Z",
        "duration_ms": 120000,
        "size_bytes": size,
        "mime_type": "audio/webm;codecs=opus",
        "created_at": "2026-10-25T10:00:00.000Z",
        "updated_at": updated,
        "_deleted": False,
        **extra,
    }


def push(client, *docs):
    response = client.post("/api/voice-notes/voice_notes/push", json=list(docs))
    assert response.status_code == 200, response.text
    return response.json()


def pull(client, seq=0):
    return client.get(f"/api/voice-notes/voice_notes/pull?seq={seq}").json()


@pytest.fixture
def vn_db(db):
    with psycopg.connect(TEST_URL, autocommit=True, row_factory=dict_row) as conn:
        conn.execute("TRUNCATE voice_notes")
        yield conn


@pytest.fixture
def data_dir(client, tmp_path):
    """Audio goes to a temp folder, not the dev data folder."""
    settings = client.app.state.settings
    client.app.state.settings = dataclasses.replace(settings, data_dir=tmp_path)
    yield tmp_path / "audio"
    client.app.state.settings = settings


def upload(client, id, content=AUDIO):
    return client.put(f"/api/voice-notes/{id}/audio", content=content)


def test_metadata_round_trip(client, vn_db):
    vn = voice_note(title="Call with X", tags=["work"])
    push(client, vn)
    doc = pull(client)["documents"][0]
    assert (doc["title"], doc["tags"], doc["duration_ms"], doc["uploaded_at"]) == (
        "Call with X", ["work"], 120000, None
    )


def test_upload_stores_the_file_and_marks_it_uploaded(client, vn_db, data_dir):
    vn = voice_note()
    push(client, vn)
    checkpoint = pull(client)["checkpoint"]["seq"]

    assert upload(client, vn["id"]).status_code == 200
    assert (data_dir / f"{vn['id']}.webm").read_bytes() == AUDIO
    # Every device sees it as uploaded through a normal pull
    doc = pull(client, seq=checkpoint)["documents"][0]
    assert doc["uploaded_at"] is not None
    assert doc["updated_at"] == vn["updated_at"]  # the device's edit time is untouched


def test_device_cannot_reset_uploaded(client, vn_db, data_dir):
    vn = voice_note()
    push(client, vn)
    upload(client, vn["id"])
    push(client, {**vn, "title": "renamed", "updated_at": "2026-10-25T11:00:00.000Z", "uploaded_at": None})
    row = vn_db.execute("SELECT title, uploaded_at FROM voice_notes").fetchone()
    assert row["title"] == "renamed" and row["uploaded_at"] is not None


def test_upload_twice_changes_nothing(client, vn_db, data_dir):
    vn = voice_note()
    push(client, vn)
    upload(client, vn["id"])
    first = vn_db.execute("SELECT uploaded_at, seq FROM voice_notes").fetchone()
    response = upload(client, vn["id"])
    assert response.status_code == 200 and response.json()["status"] == "already uploaded"
    assert vn_db.execute("SELECT uploaded_at, seq FROM voice_notes").fetchone() == first


def test_upload_before_metadata_is_404(client, vn_db, data_dir):
    assert upload(client, uuid.uuid4()).status_code == 404


def test_size_mismatch_is_refused_and_leaves_nothing(client, vn_db, data_dir):
    vn = voice_note(size=len(AUDIO) + 1)
    push(client, vn)
    assert upload(client, vn["id"]).status_code == 400
    too_big = voice_note(size=10)
    push(client, too_big)
    assert upload(client, too_big["id"]).status_code == 400
    assert list(data_dir.iterdir()) == []
    assert vn_db.execute("SELECT count(*) AS n FROM voice_notes WHERE uploaded_at IS NOT NULL").fetchone()["n"] == 0


def test_interrupted_upload_leaves_no_file(tmp_path):
    async def chunks_then_disconnect():
        yield AUDIO[:100]
        raise ConnectionResetError("client went away")

    target = tmp_path / "audio" / "x.webm"
    with pytest.raises(ConnectionResetError):
        asyncio.run(audio.save_upload(chunks_then_disconnect(), target, len(AUDIO)))
    assert list(target.parent.iterdir()) == []


def test_streaming_supports_seeking(client, vn_db, data_dir):
    vn = voice_note()
    push(client, vn)
    assert client.get(f"/api/voice-notes/{vn['id']}/audio").status_code == 404  # not uploaded yet
    upload(client, vn["id"])

    whole = client.get(f"/api/voice-notes/{vn['id']}/audio")
    assert whole.status_code == 200 and whole.content == AUDIO
    part = client.get(f"/api/voice-notes/{vn['id']}/audio", headers={"Range": "bytes=4-7"})
    assert part.status_code == 206 and part.content == b"opus"


def test_archive_keeps_the_file_and_restore_brings_it_back(client, vn_db, data_dir):
    vn = voice_note()
    push(client, vn)
    upload(client, vn["id"])
    push(client, {**vn, "_deleted": True, "updated_at": "2026-10-25T11:00:00.000Z"})

    assert (data_dir / f"{vn['id']}.webm").exists()
    items = voice_notes.list_archived(vn_db)
    assert [(i["type"], i["title"], i["recorded_at"].isoformat()) for i in items] == [
        ("voice_note", "", "2026-10-25T09:58:00+00:00")
    ]

    assert voice_notes.restore(vn_db, uuid.UUID(vn["id"])) is True
    assert pull(client)["documents"][0]["_deleted"] is False
    assert voice_notes.restore(vn_db, uuid.UUID(vn["id"])) is False
