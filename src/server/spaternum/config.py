"""Settings from environment variables. A missing one stops the server at start."""

import os
from dataclasses import dataclass
from pathlib import Path

REQUIRED = ("DATABASE_URL", "API_TOKEN", "DATA_DIR")


@dataclass(frozen=True)
class Settings:
    database_url: str
    api_token: str
    data_dir: Path
    log_level: str


def load() -> Settings:
    missing = [name for name in REQUIRED if not os.environ.get(name)]
    if missing:
        raise SystemExit(f"Missing settings: {', '.join(missing)} (see .env.example)")
    return Settings(
        database_url=os.environ["DATABASE_URL"],
        api_token=os.environ["API_TOKEN"],
        data_dir=Path(os.environ["DATA_DIR"]),
        log_level=os.environ.get("LOG_LEVEL", "INFO").upper(),
    )
