"""Notes module: folders, notes and their recordings, synced to devices; recording audio
uploaded and streamed; archive and restore.

Public functions for other modules (the archive module): list_archived(conn), restore(conn, id).
"""

from fastapi import APIRouter

from spaternum import sync
from spaternum.notes import audio
from spaternum.notes.archive import list_archived, restore
from spaternum.notes.tables import FOLDERS, NOTES, RECORDINGS

router = APIRouter(prefix="/notes")
router.include_router(sync.router(FOLDERS))
router.include_router(sync.router(NOTES))
router.include_router(sync.router(RECORDINGS))
router.include_router(audio.router, prefix="/recordings")

__all__ = ["router", "list_archived", "restore"]
