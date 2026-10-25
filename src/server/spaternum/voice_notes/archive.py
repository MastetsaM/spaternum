"""What the shared Archive page needs from voice notes. The audio file is kept when archived."""

from uuid import UUID

from psycopg import Connection


def list_archived(conn: Connection) -> list[dict]:
    rows = conn.execute(
        "SELECT id, title, recorded_at, archived_at FROM voice_notes"
        " WHERE archived_at IS NOT NULL ORDER BY archived_at DESC"
    ).fetchall()
    return [
        {
            "type": "voice_note",
            "id": r["id"],
            "title": r["title"],  # empty → the app shows recorded_at in local time
            "recorded_at": r["recorded_at"],
            "archived_at": r["archived_at"],
            "items": 0,
        }
        for r in rows
    ]


def restore(conn: Connection, id: UUID) -> bool:
    """Restored rows count as just edited, so an older pending change can't undo it."""
    row = conn.execute(
        """
        UPDATE voice_notes SET archived_at = NULL, updated_at = now(),
                               seq = nextval('voice_notes_seq')
        WHERE id = %s AND archived_at IS NOT NULL
        RETURNING id
        """,
        (id,),
    ).fetchone()
    return row is not None
