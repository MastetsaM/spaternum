"""Server side of planning/specs/calendar_spec.md."""

import uuid

import psycopg
import pytest
from psycopg.rows import dict_row

from conftest import TEST_URL

T0 = "2026-10-25T10:00:00.000Z"
T1 = "2026-10-25T11:00:00.000Z"
T2 = "2026-10-25T12:00:00.000Z"


def event(title="Meeting", updated=T0, **extra):
    """A one-off event; pass rrule for a series, series_id + original_start for an exception."""
    return {
        "id": extra.pop("id", str(uuid.uuid4())),
        "title": title,
        "notes": extra.pop("notes", ""),
        "all_day": extra.pop("all_day", False),
        "start_at": extra.pop("start_at", "2026-10-26T10:00:00.000Z"),
        "end_at": extra.pop("end_at", "2026-10-26T10:30:00.000Z"),
        "time_zone": extra.pop("time_zone", "Europe/Lisbon"),
        "rrule": extra.pop("rrule", None),
        "series_id": extra.pop("series_id", None),
        "original_start": extra.pop("original_start", None),
        "cancelled": extra.pop("cancelled", False),
        "created_at": T0,
        "updated_at": updated,
        "_deleted": False,
        **extra,
    }


def series(title="Weekly", **extra):
    return event(title, rrule="FREQ=WEEKLY;BYDAY=MO", **extra)


def exception(of, original_start="2026-11-02T10:00:00.000Z", **extra):
    return event(of["title"], series_id=of["id"], original_start=original_start, **extra)


def push(client, *docs):
    response = client.post("/api/calendar/calendar_events/push", json=list(docs))
    assert response.status_code == 200, response.text
    return response.json()


def pull(client, seq=0):
    response = client.get(f"/api/calendar/calendar_events/pull?seq={seq}")
    assert response.status_code == 200, response.text
    return response.json()


def archive(client, doc, updated=T1):
    push(client, {**doc, "_deleted": True, "updated_at": updated})


def archived(db, id):
    return db.execute("SELECT archived_at FROM calendar_events WHERE id = %s", (id,)).fetchone()["archived_at"]


def archive_list(client, query=""):
    response = client.get(f"/api/archive{query}")
    assert response.status_code == 200, response.text
    return [i for i in response.json() if i["module"] == "calendar"]


def restore(client, id):
    return client.post(f"/api/archive/calendar/{id}/restore")


@pytest.fixture
def cal_db(db):
    """Same rows as the server sees them (dict rows, as the server's pool hands out)."""
    with psycopg.connect(TEST_URL, autocommit=True, row_factory=dict_row) as conn:
        conn.execute("TRUNCATE calendar_events")
        yield conn


def test_all_three_kinds_round_trip(client, cal_db):
    one_off = event("Dentist", notes="bring card", all_day=True,
                    start_at="2026-10-27T00:00:00.000Z", end_at="2026-10-28T00:00:00.000Z")
    weekly = series(time_zone="America/New_York")
    moved = exception(weekly, start_at="2026-11-02T14:00:00.000Z", end_at="2026-11-02T14:30:00.000Z")
    cancelled = exception(weekly, original_start="2026-11-09T10:00:00.000Z", cancelled=True)
    push(client, one_off, weekly, moved, cancelled)
    pulled = {d["id"]: d for d in pull(client)["documents"]}
    assert pulled == {d["id"]: d for d in (one_off, weekly, moved, cancelled)}


def test_later_push_wins(client, cal_db):
    e = event("v1")
    push(client, e)
    assert push(client, {**e, "title": "v2", "updated_at": T1}) == []
    assert [d["title"] for d in pull(client)["documents"]] == ["v2"]


def test_older_push_gets_the_server_row_back(client, cal_db):
    e = event("new", updated=T1)
    push(client, e)
    conflicts = push(client, {**e, "title": "old", "updated_at": T0})
    assert [(c["id"], c["title"], c["updated_at"]) for c in conflicts] == [(e["id"], "new", T1)]
    assert [d["title"] for d in pull(client)["documents"]] == ["new"]


def test_exception_can_arrive_before_its_series(client, cal_db):
    weekly = series()
    ex = exception(weekly, cancelled=True)
    push(client, ex)  # no series on the server yet
    push(client, weekly)
    assert {d["id"] for d in pull(client)["documents"]} == {weekly["id"], ex["id"]}


def test_archiving_a_series_archives_its_exceptions(client, cal_db):
    weekly = series()
    ex1 = exception(weekly)
    ex2 = exception(weekly, original_start="2026-11-09T10:00:00.000Z", cancelled=True)
    alone = exception(weekly, original_start="2026-11-16T10:00:00.000Z")
    other = event("Unrelated")
    push(client, weekly, ex1, ex2, alone, other)
    archive(client, alone, updated="2026-10-25T10:30:00.000Z")
    alone_at = archived(cal_db, alone["id"])

    archive(client, weekly)
    at = archived(cal_db, weekly["id"])
    assert at is not None
    assert archived(cal_db, ex1["id"]) == at
    assert archived(cal_db, ex2["id"]) == at
    assert archived(cal_db, alone["id"]) == alone_at  # keeps its own time
    assert archived(cal_db, other["id"]) is None
    # Devices drop them: pulled as deleted
    deleted = {d["id"] for d in pull(client)["documents"] if d["_deleted"]}
    assert deleted == {weekly["id"], ex1["id"], ex2["id"], alone["id"]}


def test_archiving_a_one_off_touches_nothing_else(client, cal_db):
    weekly = series()
    ex = exception(weekly)
    e, other = event("Gone"), event("Stays")
    push(client, weekly, ex, e, other)
    archive(client, e)
    assert archived(cal_db, e["id"]) is not None
    assert [archived(cal_db, d["id"]) for d in (weekly, ex, other)] == [None, None, None]


def test_archiving_an_exception_touches_nothing_else(client, cal_db):
    weekly = series()
    ex1, ex2 = exception(weekly), exception(weekly, original_start="2026-11-09T10:00:00.000Z")
    push(client, weekly, ex1, ex2)
    archive(client, ex1)
    assert archived(cal_db, ex1["id"]) is not None
    assert archived(cal_db, weekly["id"]) is None
    assert archived(cal_db, ex2["id"]) is None


def test_archive_list_shows_one_entry_per_event_or_series(client, cal_db):
    weekly = series("  Standup  ")
    ex1 = exception(weekly)
    ex2 = exception(weekly, original_start="2026-11-09T10:00:00.000Z", cancelled=True)
    alone = exception(weekly, original_start="2026-11-16T10:00:00.000Z")
    untitled = event("   ")
    push(client, weekly, ex1, ex2, alone, untitled)
    # archived_at is the server's time, so archive one after another
    archive(client, alone, updated="2026-10-25T10:30:00.000Z")
    archive(client, untitled, updated=T1)
    archive(client, weekly, updated=T2)

    items = archive_list(client)
    assert [(i["type"], i["title"], i["items"]) for i in items] == [
        ("series", "Standup", 2),  # ex1 + ex2; the exception archived earlier isn't counted
        ("event", "(no title)", 0),
    ]
    assert {i["id"] for i in items} == {weekly["id"], untitled["id"]}  # exceptions never listed


def test_archive_list_filters_by_type(client, cal_db):
    weekly, e = series(), event()
    push(client, weekly, e)
    archive(client, e)
    archive(client, weekly, updated=T2)
    assert [i["id"] for i in archive_list(client, "?type=series")] == [weekly["id"]]
    assert [i["id"] for i in archive_list(client, "?type=event")] == [e["id"]]


def test_restoring_a_series_brings_back_only_what_was_archived_with_it(client, cal_db):
    weekly = series()
    ex = exception(weekly)
    alone = exception(weekly, original_start="2026-11-16T10:00:00.000Z")
    push(client, weekly, ex, alone)
    archive(client, alone, updated="2026-10-25T10:30:00.000Z")
    archive(client, weekly)
    checkpoint = pull(client)["checkpoint"]["seq"]

    assert restore(client, weekly["id"]).status_code == 200
    assert archived(cal_db, weekly["id"]) is None
    assert archived(cal_db, ex["id"]) is None
    assert archived(cal_db, alone["id"]) is not None  # archived separately before
    # Devices get them back as a normal change, newer than any pending edit
    back = pull(client, seq=checkpoint)["documents"]
    assert {d["id"] for d in back} == {weekly["id"], ex["id"]}
    assert all(d["_deleted"] is False and d["updated_at"] > T1 for d in back)


def test_restoring_a_one_off(client, cal_db):
    e = event()
    push(client, e)
    archive(client, e)
    checkpoint = pull(client)["checkpoint"]["seq"]
    assert restore(client, e["id"]).status_code == 200
    assert archived(cal_db, e["id"]) is None
    back = pull(client, seq=checkpoint)["documents"]
    assert [(d["id"], d["_deleted"]) for d in back] == [(e["id"], False)]
    assert back[0]["updated_at"] > T1
    assert restore(client, e["id"]).status_code == 404  # nothing archived any more
    assert archive_list(client) == []


def test_restoring_an_exception_on_its_own_is_404(client, cal_db):
    weekly = series()
    ex = exception(weekly)
    push(client, weekly, ex)
    archive(client, ex)
    assert restore(client, ex["id"]).status_code == 404
    assert archived(cal_db, ex["id"]) is not None


def test_restoring_an_unknown_id_is_404(client, cal_db):
    assert restore(client, uuid.uuid4()).status_code == 404


def test_later_edit_brings_an_archived_event_back(client, cal_db):
    e = event("v1")
    push(client, e)
    archive(client, e)
    push(client, {**e, "title": "v2", "updated_at": T2})
    assert archived(cal_db, e["id"]) is None
    assert [(d["title"], d["_deleted"]) for d in pull(client)["documents"]] == [("v2", False)]
