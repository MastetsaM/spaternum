"""What the shared Archive page needs from notes: list what was archived, and restore it.

The audio file of an archived recording is kept on the server."""

from uuid import UUID

from psycopg import Connection

# Folders archived together with `folder`: its sub-folders with the same archived_at, any depth.
ARCHIVED_WITH = """
WITH RECURSIVE sub(id) AS (
    SELECT id FROM note_folders WHERE id = %(id)s
    UNION
    SELECT f.id FROM note_folders f JOIN sub ON f.parent_id = sub.id
    WHERE f.archived_at = %(at)s
)
"""


# The first recording of the note in row `n` (any state): its date-time names an untitled note
FIRST_RECORDED = """
    (SELECT min(r.recorded_at) FROM note_recordings r WHERE r.note_id = n.id) AS first_recorded
"""


def title(note_title: str, body: str, has_recording: bool = False) -> str:
    """The note's title, or its first line when the title is empty.

    Empty when there's neither but the note has a recording: the app then shows the first
    recording's date-time (recorded_at in the entry) in local time.
    """
    first = body.split("\n", 1)[0].lstrip("# ").strip()
    return note_title.strip() or first or ("" if has_recording else "(empty)")


def list_archived(conn: Connection) -> list[dict]:
    """One entry per thing archived: a folder archived with its contents is one entry.

    Newest first. A note or sub-folder archived on its own before is its own entry.
    """
    items = []
    folders = conn.execute(
        """
        SELECT f.id, f.name, f.archived_at FROM note_folders f
        LEFT JOIN note_folders p ON p.id = f.parent_id
        WHERE f.archived_at IS NOT NULL AND p.archived_at IS DISTINCT FROM f.archived_at
        """
    ).fetchall()
    for f in folders:
        params = {"id": f["id"], "at": f["archived_at"]}
        count = conn.execute(
            ARCHIVED_WITH
            + """
            SELECT (SELECT count(*) FROM sub) - 1
                 + (SELECT count(*) FROM notes
                    WHERE folder_id IN (SELECT id FROM sub) AND archived_at = %(at)s) AS n
            """,
            params,
        ).fetchone()["n"]
        items.append(
            {"type": "folder", "id": f["id"], "title": f["name"],
             "archived_at": f["archived_at"], "items": count}
        )

    notes = conn.execute(
        """
        SELECT n.id, n.title, n.body, n.archived_at, """ + FIRST_RECORDED + """
        FROM notes n
        LEFT JOIN note_folders f ON f.id = n.folder_id
        WHERE n.archived_at IS NOT NULL AND f.archived_at IS DISTINCT FROM n.archived_at
        """
    ).fetchall()
    for n in notes:
        has_recording = n["first_recorded"] is not None
        items.append(
            {"type": "note", "id": n["id"],
             "title": title(n["title"], n["body"], has_recording),
             "archived_at": n["archived_at"], "items": 0,
             "recorded_at": n["first_recorded"]}
        )

    # A recording archived on its own (not together with its note) is its own entry,
    # titled with its note; the app shows it as "Recording in <title>"
    recordings = conn.execute(
        """
        SELECT r.id, r.recorded_at, r.archived_at, n.title, n.body FROM note_recordings r
        LEFT JOIN notes n ON n.id = r.note_id
        WHERE r.archived_at IS NOT NULL AND n.archived_at IS DISTINCT FROM r.archived_at
        """
    ).fetchall()
    for r in recordings:
        items.append(
            {"type": "recording", "id": r["id"],
             "title": title(r["title"] or "", r["body"] or "", True),
             "archived_at": r["archived_at"], "items": 0, "recorded_at": r["recorded_at"]}
        )
    return sorted(items, key=lambda i: i["archived_at"], reverse=True)


RESTORE_RECORDINGS = """
    UPDATE note_recordings SET archived_at = NULL, updated_at = now(),
                               seq = nextval('note_recordings_seq')
    WHERE note_id = ANY(%(notes)s) AND archived_at = %(at)s
"""


def restore(conn: Connection, id: UUID) -> bool:
    """Restore a folder, a note or a recording, with everything archived together with it.

    A note brings back its recordings archived with it; a recording brings back its note if
    that's archived. Restored rows count as just edited (updated_at = now), so an older pending
    change from another device can't undo the restore. False if nothing archived has that id.
    """
    return restore_folder(conn, id) or restore_note(conn, id) or restore_recording(conn, id)


def restore_folder(conn: Connection, id: UUID) -> bool:
    folder = conn.execute(
        "SELECT archived_at FROM note_folders WHERE id = %s AND archived_at IS NOT NULL", (id,)
    ).fetchone()
    if not folder:
        return False
    params = {"id": id, "at": folder["archived_at"]}
    ids = [
        r["id"]
        for r in conn.execute(
            ARCHIVED_WITH
            + """
            UPDATE note_folders SET archived_at = NULL, updated_at = now(),
                                    seq = nextval('note_folders_seq')
            WHERE id IN (SELECT id FROM sub)
            RETURNING id
            """,
            params,
        )
    ]
    note_ids = [
        r["id"]
        for r in conn.execute(
            """
            UPDATE notes SET archived_at = NULL, updated_at = now(), seq = nextval('notes_seq')
            WHERE folder_id = ANY(%(folders)s) AND archived_at = %(at)s
            RETURNING id
            """,
            {"folders": ids, "at": folder["archived_at"]},
        )
    ]
    conn.execute(RESTORE_RECORDINGS, {"notes": note_ids, "at": folder["archived_at"]})
    return True


def restore_note(conn: Connection, id: UUID) -> bool:
    note = conn.execute(
        """
        UPDATE notes n SET archived_at = NULL, updated_at = now(), seq = nextval('notes_seq')
        FROM (SELECT id, archived_at FROM notes WHERE id = %s) old
        WHERE n.id = old.id AND n.archived_at IS NOT NULL
        RETURNING old.archived_at
        """,
        (id,),
    ).fetchone()
    if not note:
        return False
    conn.execute(RESTORE_RECORDINGS, {"notes": [id], "at": note["archived_at"]})
    return True


def restore_recording(conn: Connection, id: UUID) -> bool:
    recording = conn.execute(
        """
        UPDATE note_recordings SET archived_at = NULL, updated_at = now(),
                                   seq = nextval('note_recordings_seq')
        WHERE id = %s AND archived_at IS NOT NULL
        RETURNING note_id
        """,
        (id,),
    ).fetchone()
    if not recording:
        return False
    restore_note(conn, recording["note_id"])  # no-op when the note is active
    return True
