"""Plain-text logs, one line per event, to stdout. Never log the token or note/audio content."""

import logging
import sys
import time

from fastapi import Request
from fastapi.responses import JSONResponse

log = logging.getLogger("spaternum.http")


def setup(level: str) -> None:
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        stream=sys.stdout,
        force=True,
    )
    # Uvicorn sets up its own handlers; send its messages through ours instead.
    for name in ("uvicorn", "uvicorn.error"):
        logging.getLogger(name).handlers.clear()
        logging.getLogger(name).propagate = True
    # Requests are logged by log_requests below, with their duration.
    logging.getLogger("uvicorn.access").disabled = True


async def log_requests(request: Request, call_next):
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        log.exception("%s %s failed", request.method, request.url.path)
        response = JSONResponse({"detail": "internal error"}, status_code=500)
    ms = (time.perf_counter() - start) * 1000
    # Path only, never the query string
    log.info("%s %s %d %.0fms", request.method, request.url.path, response.status_code, ms)
    return response
