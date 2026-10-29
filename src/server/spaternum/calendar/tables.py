"""The synced table, with archiving a series hooked into the sync helper."""

from datetime import datetime
from uuid import UUID

from psycopg import Connection

from spaternum import sync


class Event(sync.SyncDoc):
    title: str
    notes: str = ""
    all_day: bool = False
    start_at: datetime
    end_at: datetime  # not checked against start_at here; the app's form refuses it
    time_zone: str
    rrule: str | None = None  # set = a series
    series_id: UUID | None = None  # set = an exception of that series
    original_start: datetime | None = None
    cancelled: bool = False


def archive_exceptions(conn: Connection, event_id: UUID, archived_at: datetime) -> None:
    """Archiving a series archives its still-active exceptions, with the series' time.

    Exceptions archived earlier keep their own time. Archiving a one-off or an exception
    changes nothing else.
    """
    conn.execute(
        """
        UPDATE calendar_events SET archived_at = %(at)s, seq = nextval('calendar_events_seq')
        WHERE series_id = %(id)s AND archived_at IS NULL
          AND EXISTS (SELECT 1 FROM calendar_events
                      WHERE id = %(id)s AND rrule IS NOT NULL AND series_id IS NULL)
        """,
        {"id": event_id, "at": archived_at},
    )


EVENTS = sync.SyncTable("calendar_events", Event, on_archive=archive_exceptions)
