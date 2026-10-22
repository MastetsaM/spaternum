"""One SSE stream for all synced tables: each event's data is the name of a table that changed.

Clients read it with fetch (EventSource can't send the token header) and tell the matching
RxDB collection to pull. Missing an event only delays sync; the seq pull catches up.
"""

import logging

import psycopg
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

log = logging.getLogger("spaternum.events")

KEEPALIVE = 25  # seconds between comment lines, so proxies and phone networks keep it open

router = APIRouter()


@router.get("/events")
async def events(request: Request):
    database_url = request.app.state.settings.database_url

    async def stream():
        log.info("events: client connected")
        try:
            # LISTEN needs its own connection for as long as the stream is open
            async with await psycopg.AsyncConnection.connect(database_url, autocommit=True) as conn:
                await conn.execute("LISTEN sync")
                yield ": connected\n\n"
                while True:
                    async for notify in conn.notifies(timeout=KEEPALIVE):
                        yield f"data: {notify.payload}\n\n"
                    yield ": keepalive\n\n"
        finally:
            log.info("events: client disconnected")

    return StreamingResponse(
        stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"}
    )
