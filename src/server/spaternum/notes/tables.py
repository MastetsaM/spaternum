"""The three synced tables, with the notes-specific rules hooked into the sync helper."""

from datetime import datetime
from uuid import UUID

from psycopg import Connection

from spaternum import sync


class Folder(sync.SyncDoc):
    parent_id: UUID | None = None
    name: str


class Note(sync.SyncDoc):
    folder_id: UUID | None = None
    title: str = ""  # optional; empty = the body's first line is shown
    body: str = ""
    tags: list[str] = []
    pinned: bool = False
    edited_at: datetime  # sort key "last edited"; required, so an old app can't wipe it


class Recording(sync.SyncDoc):
    note_id: UUID
    recorded_at: datetime
    duration_ms: int
    size_bytes: int
    mime_type: str
    uploaded_at: datetime | None = None


def creates_loop(conn: Connection, folder: Folder) -> bool:
    """True if the folder would end up inside itself (moved into one of its sub-folders)."""
    if folder.parent_id is None:
        return False
    if folder.parent_id == folder.id:
        return True
    # Walk up from the new parent; UNION (not UNION ALL) stops even if a loop already exists
    row = conn.execute(
        """
        WITH RECURSIVE up(id, parent_id) AS (
            SELECT id, parent_id FROM note_folders WHERE id = %(parent)s
            UNION
            SELECT f.id, f.parent_id FROM note_folders f JOIN up ON f.id = up.parent_id
        )
        SELECT 1 FROM up WHERE id = %(self)s
        """,
        {"parent": folder.parent_id, "self": folder.id},
    ).fetchone()
    return row is not None


def archive_contents(conn: Connection, folder_id: UUID, archived_at: datetime) -> None:
    """Archive everything still active inside the folder, any depth, with the folder's time.

    Sub-folders archived earlier on their own are left alone, and so is what's inside them.
    """
    sub_ids = [
        r["id"]
        for r in conn.execute(
            """
            WITH RECURSIVE sub(id) AS (
                SELECT id FROM note_folders WHERE parent_id = %(id)s AND archived_at IS NULL
                UNION
                SELECT f.id FROM note_folders f JOIN sub ON f.parent_id = sub.id
                WHERE f.archived_at IS NULL
            )
            UPDATE note_folders SET archived_at = %(at)s, seq = nextval('note_folders_seq')
            WHERE id IN (SELECT id FROM sub)
            RETURNING id
            """,
            {"id": folder_id, "at": archived_at},
        )
    ]
    note_ids = [
        r["id"]
        for r in conn.execute(
            """
            UPDATE notes SET archived_at = %(at)s, seq = nextval('notes_seq')
            WHERE archived_at IS NULL AND folder_id = ANY(%(folders)s)
            RETURNING id
            """,
            {"at": archived_at, "folders": [folder_id, *sub_ids]},
        )
    ]
    archive_recordings(conn, note_ids, archived_at)


def archive_recordings(conn: Connection, note_ids: list[UUID], archived_at: datetime) -> None:
    """Archive the notes' active recordings with the notes' time, so they restore together.

    Recordings archived earlier on their own keep their own time.
    """
    conn.execute(
        """
        UPDATE note_recordings SET archived_at = %(at)s, seq = nextval('note_recordings_seq')
        WHERE archived_at IS NULL AND note_id = ANY(%(notes)s)
        """,
        {"at": archived_at, "notes": note_ids},
    )


def archive_note(conn: Connection, note_id: UUID, archived_at: datetime) -> None:
    archive_recordings(conn, [note_id], archived_at)


FOLDERS = sync.SyncTable(
    "note_folders", Folder, on_archive=archive_contents, reject=creates_loop
)
NOTES = sync.SyncTable("notes", Note, on_archive=archive_note)
# uploaded_at is set only when the server has the file; a device can't reset it
RECORDINGS = sync.SyncTable("note_recordings", Recording, server_owned=["uploaded_at"])
