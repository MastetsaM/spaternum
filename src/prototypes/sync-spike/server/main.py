"""Pull/push endpoints for RxDB's HTTP replication, one table: items."""

import os
from datetime import datetime, timezone

import psycopg
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from psycopg.rows import dict_row
from pydantic import BaseModel

app = FastAPI()
# The Tauri webview's origin differs per platform; the bearer token is the real check
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class Item(BaseModel):
    id: str
    text: str
    created_at: str
    updated_at: str
    archived_at: str | None


def check_token(authorization: str = Header("")):
    if authorization != f"Bearer {os.environ['API_TOKEN']}":
        raise HTTPException(401, "bad token")


def connect():
    return psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row)


def iso(dt: datetime | None) -> str | None:
    # Same format as JavaScript's toISOString(), so documents round-trip unchanged
    if dt is None:
        return None
    return dt.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def to_doc(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "text": row["text"],
        "created_at": iso(row["created_at"]),
        "updated_at": iso(row["updated_at"]),
        "archived_at": iso(row["archived_at"]),
        "_deleted": False,  # we archive, never delete
    }


@app.get("/items/pull", dependencies=[Depends(check_token)])
def pull(seq: int = 0, limit: int = 100):
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM items WHERE seq > %s ORDER BY seq LIMIT %s", (seq, limit)
        ).fetchall()
    last = rows[-1]["seq"] if rows else seq
    return {"documents": [to_doc(r) for r in rows], "checkpoint": {"seq": last}}


@app.post("/items/push", dependencies=[Depends(check_token)])
def push(items: list[Item]):
    """Latest write wins. Returns the server's row for every item it didn't take."""
    conflicts = []
    with connect() as conn:
        for item in items:
            taken = conn.execute(
                """
                INSERT INTO items (id, text, created_at, updated_at, archived_at, seq)
                VALUES (%(id)s, %(text)s, %(created_at)s, %(updated_at)s, %(archived_at)s,
                        nextval('items_seq'))
                ON CONFLICT (id) DO UPDATE
                    SET text = excluded.text,
                        updated_at = excluded.updated_at,
                        archived_at = excluded.archived_at,
                        seq = nextval('items_seq')
                    WHERE excluded.updated_at > items.updated_at
                RETURNING id
                """,
                item.model_dump(),
            ).fetchone()
            if taken is None:
                row = conn.execute("SELECT * FROM items WHERE id = %s", (item.id,)).fetchone()
                conflicts.append(to_doc(row))
    return conflicts
