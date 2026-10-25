"""What the shared Archive page needs from notes: list what was archived, and restore it."""

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


def title(body: str) -> str:
    first = body.split("\n", 1)[0].lstrip("# ").strip()
    return first or "(empty)"


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
        SELECT n.id, n.body, n.archived_at FROM notes n
        LEFT JOIN note_folders f ON f.id = n.folder_id
        WHERE n.archived_at IS NOT NULL AND f.archived_at IS DISTINCT FROM n.archived_at
        """
    ).fetchall()
    for n in notes:
        items.append(
            {"type": "note", "id": n["id"], "title": title(n["body"]),
             "archived_at": n["archived_at"], "items": 0}
        )
    return sorted(items, key=lambda i: i["archived_at"], reverse=True)


def restore(conn: Connection, id: UUID) -> bool:
    """Restore a note, or a folder with everything archived together with it.

    Restored rows count as just edited (updated_at = now), so an older pending change from
    another device can't undo the restore. False if there's nothing archived with that id.
    """
    folder = conn.execute(
        "SELECT archived_at FROM note_folders WHERE id = %s AND archived_at IS NOT NULL", (id,)
    ).fetchone()
    if folder:
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
        conn.execute(
            """
            UPDATE notes SET archived_at = NULL, updated_at = now(), seq = nextval('notes_seq')
            WHERE folder_id = ANY(%(folders)s) AND archived_at = %(at)s
            """,
            {"folders": ids, "at": folder["archived_at"]},
        )
        return True

    note = conn.execute(
        """
        UPDATE notes SET archived_at = NULL, updated_at = now(), seq = nextval('notes_seq')
        WHERE id = %s AND archived_at IS NOT NULL
        RETURNING id
        """,
        (id,),
    ).fetchone()
    return note is not None
