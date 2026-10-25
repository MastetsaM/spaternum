"""Audio files: upload from the phone, stream to any device. Files live at DATA_DIR/audio/<id>.webm."""

import errno
import logging
import os
import uuid
from collections.abc import AsyncIterator
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse
from starlette.concurrency import run_in_threadpool

log = logging.getLogger("spaternum.voice_notes")

router = APIRouter()


class SizeMismatch(Exception):
    pass


def audio_dir(request: Request) -> Path:
    return request.app.state.settings.data_dir / "audio"


def audio_path(folder: Path, id: UUID) -> Path:
    # Derived from the id, never stored (voice-notes spec)
    return folder / f"{id}.webm"


async def save_upload(chunks: AsyncIterator[bytes], target: Path, expected_size: int) -> None:
    """Write to a temp file, check the size, then rename into place.

    Anything that goes wrong (size, disconnect, full disk) leaves no file behind.
    """
    target.parent.mkdir(parents=True, exist_ok=True)
    temp = target.with_name(f".{target.name}.{uuid.uuid4().hex}.part")
    try:
        size = 0
        with open(temp, "wb") as f:
            async for chunk in chunks:
                size += len(chunk)
                if size > expected_size:
                    raise SizeMismatch(f"more than the expected {expected_size} bytes")
                f.write(chunk)
            f.flush()
            os.fsync(f.fileno())
        if size != expected_size:
            raise SizeMismatch(f"got {size} bytes, expected {expected_size}")
        temp.replace(target)
    finally:
        temp.unlink(missing_ok=True)


def find_row(pool, id: UUID) -> dict | None:
    with pool.connection() as conn:
        return conn.execute(
            "SELECT size_bytes, uploaded_at FROM voice_notes WHERE id = %s", (id,)
        ).fetchone()


def mark_uploaded(pool, id: UUID) -> None:
    # New seq so every device pulls the change; updated_at stays the device's
    with pool.connection() as conn:
        conn.execute(
            "UPDATE voice_notes SET uploaded_at = now(), seq = nextval('voice_notes_seq')"
            " WHERE id = %s",
            (id,),
        )


@router.put("/{id}/audio")
async def upload(id: UUID, request: Request):
    pool = request.app.state.pool
    row = await run_in_threadpool(find_row, pool, id)
    if row is None:
        # The metadata push hasn't reached the server yet; the client retries later
        raise HTTPException(404, "no voice note with this id yet")

    target = audio_path(audio_dir(request), id)
    if row["uploaded_at"] is not None and target.exists() and target.stat().st_size == row["size_bytes"]:
        return {"status": "already uploaded"}

    try:
        await save_upload(request.stream(), target, row["size_bytes"])
    except SizeMismatch as e:
        log.warning("upload %s refused: %s", id, e)
        raise HTTPException(400, f"size mismatch: {e}")
    except OSError as e:
        if e.errno == errno.ENOSPC:
            log.error("upload %s failed: disk full", id)
            raise HTTPException(507, "server disk full")
        raise

    await run_in_threadpool(mark_uploaded, pool, id)
    log.info("upload %s: %d bytes", id, row["size_bytes"])
    return {"status": "uploaded"}


@router.get("/{id}/audio")
def stream(id: UUID, request: Request):
    """The whole file, or a part of it (Range requests), so players can seek."""
    path = audio_path(audio_dir(request), id)
    if not path.exists():
        raise HTTPException(404, "audio not uploaded")
    return FileResponse(path, media_type="audio/webm")
