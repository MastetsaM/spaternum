"""planning/specs/archive_spec.md."""

import uuid

import psycopg
import pytest
from psycopg.rows import dict_row

from conftest import TEST_URL
from notes_test import folder, note
from voice_notes_test import voice_note


def push(client, path, *docs):
    response = client.post(f"/api/{path}/push", json=list(docs))
    assert response.status_code == 200, response.text


def archive(client, path, doc, updated):
    push(client, path, {**doc, "_deleted": True, "updated_at": updated})


@pytest.fixture
def archived(client, db):
    """A note archived at 11:00, a folder with a note at 12:00, a voice note at 13:00."""
    with psycopg.connect(TEST_URL, autocommit=True, row_factory=dict_row) as conn:
        conn.execute("TRUNCATE note_folders, notes, voice_notes")
    f, n_in, n_alone, vn = folder("Folder"), None, note("Alone"), voice_note()
    n_in = note("Inside", f["id"])
    push(client, "notes/note_folders", f)
    push(client, "notes/notes", n_in, n_alone)
    push(client, "voice-notes/voice_notes", vn)
    # archived_at is the server's time, so archive one after another
    archive(client, "notes/notes", n_alone, "2026-10-25T11:00:00.000Z")
    archive(client, "notes/note_folders", f, "2026-10-25T12:00:00.000Z")
    archive(client, "voice-notes/voice_notes", vn, "2026-10-25T13:00:00.000Z")
    return {"folder": f, "inside": n_in, "alone": n_alone, "voice": vn}


def test_list_has_every_module_newest_first(client, archived):
    items = client.get("/api/archive").json()
    assert [(i["module"], i["type"], i["title"], i["items"]) for i in items] == [
        ("voice_notes", "voice_note", "", 0),
        ("notes", "folder", "Folder", 1),
        ("notes", "note", "Alone", 0),
    ]


def test_archived_note_shows_its_title_before_its_first_line(client, archived):
    push(client, "notes/notes", {**archived["alone"], "title": "Named", "_deleted": True,
                                 "updated_at": "2026-10-25T14:00:00.000Z"})
    notes = client.get("/api/archive?type=note").json()
    assert [i["title"] for i in notes] == ["Named"]


def test_list_filters_by_type(client, archived):
    assert [i["type"] for i in client.get("/api/archive?type=folder").json()] == ["folder"]


def test_restore_through_each_module(client, archived):
    for module, key in [("notes", "folder"), ("notes", "alone"), ("voice_notes", "voice")]:
        id = archived[key]["id"]
        response = client.post(f"/api/archive/{module}/{id}/restore")
        assert response.status_code == 200, response.text
    assert client.get("/api/archive").json() == []
    # The note inside the folder came back with it
    docs = client.get("/api/notes/notes/pull").json()["documents"]
    assert not any(d["_deleted"] for d in docs)


def test_unknown_module_or_id_is_404(client, archived):
    assert client.post(f"/api/archive/nope/{uuid.uuid4()}/restore").status_code == 404
    assert client.post(f"/api/archive/notes/{uuid.uuid4()}/restore").status_code == 404
    assert client.get("/api/archive", headers={"Authorization": ""}).status_code == 401
