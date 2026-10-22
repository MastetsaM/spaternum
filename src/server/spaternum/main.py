"""The FastAPI app. Run: uv run --env-file .env uvicorn spaternum.main:app"""

import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from psycopg import OperationalError
from psycopg_pool import PoolTimeout

from spaternum import config, db, events, logs
from spaternum.auth import require_token

log = logging.getLogger("spaternum")


def create_app(extra_routers: tuple[APIRouter, ...] = ()) -> FastAPI:
    settings = config.load()
    logs.setup(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        log.info(
            "starting: data_dir=%s log_level=%s database=%s",
            settings.data_dir,
            settings.log_level,
            settings.database_url.split("@")[-1],  # host/db only, no password
        )
        app.state.pool = db.open_pool(settings.database_url)
        yield
        app.state.pool.close()

    app = FastAPI(title="Spaternum", lifespan=lifespan)
    app.state.settings = settings

    # The Tauri webview's origin differs per platform; the token is the real check.
    # Date is exposed so clients can measure their clock drift.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Date"],
    )
    app.middleware("http")(logs.log_requests)

    @app.exception_handler(PoolTimeout)
    @app.exception_handler(OperationalError)
    async def database_down(request, exc):
        log.warning("database unavailable: %s", exc)
        return JSONResponse({"detail": "database unavailable"}, status_code=503)

    @app.get("/health")
    def health():
        try:
            with app.state.pool.connection(timeout=2) as conn:
                conn.execute("SELECT 1")
            database = "up"
        except (PoolTimeout, OperationalError):
            database = "down"
        return {"status": "ok", "database": database}

    api = APIRouter(prefix="/api", dependencies=[Depends(require_token)])
    api.include_router(events.router)
    for router in extra_routers:
        api.include_router(router)
    app.include_router(api)
    return app


app = create_app()
