"""Notes module: folders and notes, synced to devices; archive and restore.

Public functions for other modules (the archive module): list_archived(conn), restore(conn, id).
"""

from fastapi import APIRouter

from spaternum import sync
from spaternum.notes.archive import list_archived, restore
from spaternum.notes.tables import FOLDERS, NOTES

router = APIRouter(prefix="/notes")
router.include_router(sync.router(FOLDERS))
router.include_router(sync.router(NOTES))

__all__ = ["router", "list_archived", "restore"]
