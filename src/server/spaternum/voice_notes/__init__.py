"""Voice notes module: recording metadata synced to devices, audio uploaded and streamed.

Public functions for other modules (the archive module): list_archived(conn), restore(conn, id).
"""

from datetime import datetime

from fastapi import APIRouter

from spaternum import sync
from spaternum.voice_notes import audio
from spaternum.voice_notes.archive import list_archived, restore


class VoiceNote(sync.SyncDoc):
    title: str = ""
    tags: list[str] = []
    recorded_at: datetime
    duration_ms: int
    size_bytes: int
    mime_type: str
    uploaded_at: datetime | None = None


# uploaded_at is set only when the server has the file; a device can't reset it
VOICE_NOTES = sync.SyncTable("voice_notes", VoiceNote, server_owned=["uploaded_at"])

router = APIRouter(prefix="/voice-notes")
router.include_router(sync.router(VOICE_NOTES))
router.include_router(audio.router)

__all__ = ["router", "list_archived", "restore"]
