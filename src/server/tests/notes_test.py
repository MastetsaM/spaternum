"""Server side of planning/specs/notes_spec.md."""

import uuid

import psycopg
import pytest
from psycopg.rows import dict_row

from conftest import TEST_URL
from spaternum import notes

T0 = "2026-10-25T10:00:00.000Z"


def folder(name, parent=None, updated=T0, **extra):
    return {
        "id": extra.pop("id", str(uuid.uuid4())),
        "parent_id": parent,
        "name": name,
        "created_at": T0,
        "updated_at": updated,
        "_deleted": False,
        **extra,
    }


def note(body, folder_id=None, updated=T0, **extra):
    return {
        "id": extra.pop("id", str(uuid.uuid4())),
        "folder_id": folder_id,
        "body": body,
        "tags": extra.pop("tags", []),
        "pinned": extra.pop("pinned", False),
        "created_at": T0,
        "updated_at": updated,
        "_deleted": False,
        **extra,
    }


def push(client, table, *docs):
    response = client.post(f"/api/notes/{table}/push", json=list(docs))
    assert response.status_code == 200, response.text
    return response.json()


def pull(client, table, seq=0):
    response = client.get(f"/api/notes/{table}/pull?seq={seq}")
    assert response.status_code == 200, response.text
    return response.json()


def archive(client, table, doc, updated="2026-10-25T11:00:00.000Z"):
    push(client, table, {**doc, "_deleted": True, "updated_at": updated})


def archived(db, table, id):
    return db.execute(f"SELECT archived_at FROM {table} WHERE id = %s", (id,)).fetchone()["archived_at"]


@pytest.fixture
def notes_db(db):
    """Same rows as the server sees them (dict rows, as the server's pool hands out)."""
    with psycopg.connect(TEST_URL, autocommit=True, row_factory=dict_row) as conn:
        conn.execute("TRUNCATE note_folders, notes")
        yield conn


def test_notes_and_folders_round_trip(client, notes_db):
    f = folder("Work")
    n = note("Title\nbody", f["id"], tags=["a", "b"], pinned=True)
    push(client, "note_folders", f)
    push(client, "notes", n)
    assert pull(client, "note_folders")["documents"][0]["name"] == "Work"
    pulled = pull(client, "notes")["documents"][0]
    assert {k: pulled[k] for k in ("folder_id", "body", "tags", "pinned")} == {
        "folder_id": f["id"], "body": "Title\nbody", "tags": ["a", "b"], "pinned": True
    }


def test_note_can_arrive_before_its_folder(client, notes_db):
    f = folder("Later")
    push(client, "notes", note("early", f["id"]))  # no folder on the server yet
    child = folder("Child", parent=f["id"])
    push(client, "note_folders", child, f)  # child before its parent, same batch
    assert len(pull(client, "note_folders")["documents"]) == 2


def test_archiving_a_folder_archives_its_contents(client, notes_db):
    top, sub = folder("Top"), None
    sub = folder("Sub", parent=top["id"])
    n1, n2 = note("in top", top["id"]), note("in sub", sub["id"])
    alone = note("archived alone earlier", top["id"])
    push(client, "note_folders", top, sub)
    push(client, "notes", n1, n2, alone)
    archive(client, "notes", alone, updated="2026-10-25T10:30:00.000Z")
    alone_at = archived(notes_db, "notes", alone["id"])

    archive(client, "note_folders", top)
    at = archived(notes_db, "note_folders", top["id"])
    assert archived(notes_db, "note_folders", sub["id"]) == at
    assert archived(notes_db, "notes", n1["id"]) == at
    assert archived(notes_db, "notes", n2["id"]) == at
    assert archived(notes_db, "notes", alone["id"]) == alone_at  # keeps its own time
    # Devices drop them: pulled as deleted
    assert all(d["_deleted"] for d in pull(client, "notes")["documents"])
    assert all(d["_deleted"] for d in pull(client, "note_folders")["documents"])


def test_archive_list_shows_one_entry_per_thing_archived(client, notes_db):
    top = folder("Top")
    sub = folder("Sub", parent=top["id"])
    alone = note("# Alone\nmore", top["id"])
    push(client, "note_folders", top, sub)
    push(client, "notes", note("a", top["id"]), note("b", sub["id"]), alone)
    archive(client, "notes", alone, updated="2026-10-25T10:30:00.000Z")
    archive(client, "note_folders", top)

    items = notes.list_archived(notes_db)
    assert [(i["type"], i["title"], i["items"]) for i in items] == [
        ("folder", "Top", 3),  # Sub + 2 notes archived with it
        ("note", "Alone", 0),
    ]


def test_restoring_a_folder_brings_back_only_what_was_archived_with_it(client, notes_db):
    top = folder("Top")
    sub = folder("Sub", parent=top["id"])
    n1, alone = note("with folder", sub["id"]), note("alone", top["id"])
    push(client, "note_folders", top, sub)
    push(client, "notes", n1, alone)
    archive(client, "notes", alone, updated="2026-10-25T10:30:00.000Z")
    archive(client, "note_folders", top)
    checkpoint = pull(client, "notes")["checkpoint"]["seq"]

    assert notes.restore(notes_db, uuid.UUID(top["id"])) is True
    assert archived(notes_db, "note_folders", top["id"]) is None
    assert archived(notes_db, "note_folders", sub["id"]) is None
    assert archived(notes_db, "notes", n1["id"]) is None
    assert archived(notes_db, "notes", alone["id"]) is not None  # archived separately before
    # Devices get them back as a normal change, newer than any pending edit
    back = pull(client, "notes", seq=checkpoint)["documents"]
    assert [d["body"] for d in back] == ["with folder"]
    assert back[0]["_deleted"] is False and back[0]["updated_at"] > "2026-10-25T11:00"


def test_restoring_a_single_note(client, notes_db):
    n = note("x")
    push(client, "notes", n)
    archive(client, "notes", n)
    assert notes.restore(notes_db, uuid.UUID(n["id"])) is True
    assert archived(notes_db, "notes", n["id"]) is None
    assert notes.restore(notes_db, uuid.UUID(n["id"])) is False  # nothing archived any more
    assert notes.restore(notes_db, uuid.uuid4()) is False


def test_moving_a_folder_into_its_own_subfolder_is_refused(client, notes_db):
    a = folder("A")
    b = folder("B", parent=a["id"])
    push(client, "note_folders", a, b)
    conflicts = push(
        client, "note_folders", {**a, "parent_id": b["id"], "updated_at": "2026-10-25T12:00:00.000Z"}
    )
    assert conflicts[0]["parent_id"] is None  # the device goes back to the server's version
    row = notes_db.execute("SELECT parent_id FROM note_folders WHERE id = %s", (a["id"],)).fetchone()
    assert row["parent_id"] is None

    self_parent = push(
        client, "note_folders", {**a, "parent_id": a["id"], "updated_at": "2026-10-25T12:00:00.000Z"}
    )
    assert self_parent[0]["parent_id"] is None


def test_later_edit_brings_an_archived_note_back(client, notes_db):
    n = note("v1")
    push(client, "notes", n)
    archive(client, "notes", n)
    push(client, "notes", {**n, "body": "v2", "updated_at": "2026-10-25T12:00:00.000Z"})
    assert archived(notes_db, "notes", n["id"]) is None


def test_title_round_trips_and_defaults_to_empty(client, notes_db):
    with_title = note("first line\nbody", title="My title")
    without = note("only a body")  # an older app sends no title
    push(client, "notes", with_title, without)
    titles = {d["id"]: d["title"] for d in pull(client, "notes")["documents"]}
    assert titles == {with_title["id"]: "My title", without["id"]: ""}
