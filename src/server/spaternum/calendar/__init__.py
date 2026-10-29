"""Calendar module: one-off and repeating events synced to devices; archive and restore.

Public functions for other modules (the archive module): list_archived(conn), restore(conn, id).
"""

from fastapi import APIRouter

from spaternum import sync
from spaternum.calendar.archive import list_archived, restore
from spaternum.calendar.tables import EVENTS

router = APIRouter(prefix="/calendar")
router.include_router(sync.router(EVENTS))

__all__ = ["router", "list_archived", "restore"]
