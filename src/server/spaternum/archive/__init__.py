"""Archive module: owns no tables. Lists and restores archived items through each module's
public list_archived(conn) and restore(conn, id). A new module joins by being added to MODULES.
"""

import logging
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from psycopg import Connection
from pydantic import BaseModel

from spaternum import notes, voice_notes
from spaternum.db import get_conn

log = logging.getLogger("spaternum.archive")

MODULES = {"notes": notes, "voice_notes": voice_notes}

router = APIRouter(prefix="/archive")


class ArchivedItem(BaseModel):
    module: str
    type: str  # folder, note, voice_note
    id: UUID
    title: str
    archived_at: datetime
    items: int  # for a folder: what was archived with it
    recorded_at: datetime | None = None  # voice notes; shown when title is empty


@router.get("", response_model=list[ArchivedItem])
def list_archived(type: str | None = None, conn: Connection = Depends(get_conn)):
    """Everything archived, newest first. type: folder, note or voice_note."""
    items = [
        {"module": name, **item}
        for name, module in MODULES.items()
        for item in module.list_archived(conn)
    ]
    if type:
        items = [i for i in items if i["type"] == type]
    return sorted(items, key=lambda i: i["archived_at"], reverse=True)


class Restored(BaseModel):
    status: str


@router.post("/{module}/{id}/restore", response_model=Restored)
def restore(module: str, id: UUID, conn: Connection = Depends(get_conn)):
    if module not in MODULES:
        raise HTTPException(404, f"unknown module {module}")
    if not MODULES[module].restore(conn, id):
        raise HTTPException(404, "nothing archived with this id")
    log.info("restored %s %s", module, id)
    return {"status": "restored"}
