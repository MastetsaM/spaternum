"""Settings module: small settings synced across devices (favorite tools). Never archived."""

from fastapi import APIRouter

from spaternum import sync


class Setting(sync.SyncDoc):
    key: str
    value: str  # JSON; the server never looks inside


SETTINGS = sync.SyncTable("settings", Setting)

router = APIRouter(prefix="/settings")
router.include_router(sync.router(SETTINGS))

__all__ = ["router"]
