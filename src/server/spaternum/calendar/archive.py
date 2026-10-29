"""What the shared Archive page needs from the calendar: list what was archived, and restore it.

A series and the exceptions archived with it (same archived_at) are one entry. Exceptions are
never listed on their own: they come back only with their series.
"""

from uuid import UUID

from psycopg import Connection


def list_archived(conn: Connection) -> list[dict]:
    """One entry per archived one-off event or series, newest first."""
    rows = conn.execute(
        """
        SELECT e.id, e.title, e.rrule, e.archived_at,
               (SELECT count(*) FROM calendar_events x
                WHERE x.series_id = e.id AND x.archived_at = e.archived_at) AS exceptions
        FROM calendar_events e
        WHERE e.archived_at IS NOT NULL AND e.series_id IS NULL
        ORDER BY e.archived_at DESC
        """
    ).fetchall()
    return [
        {
            "type": "series" if r["rrule"] else "event",
            "id": r["id"],
            "title": r["title"].strip() or "(no title)",
            "archived_at": r["archived_at"],
            "items": r["exceptions"] if r["rrule"] else 0,
        }
        for r in rows
    ]


def restore(conn: Connection, id: UUID) -> bool:
    """Restore a one-off event, or a series with the exceptions archived together with it.

    Restored rows count as just edited (updated_at = now), so an older pending change from
    another device can't undo the restore. False if there's no archived event or series with
    that id (an exception's id included).
    """
    row = conn.execute(
        "SELECT rrule, archived_at FROM calendar_events"
        " WHERE id = %s AND series_id IS NULL AND archived_at IS NOT NULL",
        (id,),
    ).fetchone()
    if row is None:
        return False
    conn.execute(
        """
        UPDATE calendar_events SET archived_at = NULL, updated_at = now(),
                                   seq = nextval('calendar_events_seq')
        WHERE id = %(id)s
           OR (%(series)s AND series_id = %(id)s AND archived_at = %(at)s)
        """,
        {"id": id, "series": row["rrule"] is not None, "at": row["archived_at"]},
    )
    return True
