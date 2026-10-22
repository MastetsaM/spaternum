"""Pull/push endpoints for RxDB's HTTP replication, built once per synced table.

A synced table has: id uuid PRIMARY KEY, created_at, updated_at, archived_at, seq bigint,
a sequence named <table>_seq, and the sync_notify trigger (core/migrations/001_sync.sql).
"""

import logging
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from psycopg import Connection, sql
from pydantic import BaseModel, ConfigDict, Field

from spaternum.db import get_conn

log = logging.getLogger("spaternum.sync")


class SyncDoc(BaseModel):
    """Fields every synced document has. Modules subclass it with their own columns."""

    model_config = ConfigDict(populate_by_name=True)

    id: UUID
    created_at: datetime
    updated_at: datetime
    deleted: bool = Field(False, alias="_deleted")  # RxDB's removal flag = archived here


# Called in the push's transaction after a row was archived: (conn, id, archived_at)
ArchiveHook = Callable[[Connection, UUID, datetime], None]


@dataclass
class SyncTable:
    name: str
    model: type[SyncDoc]
    server_owned: list[str] = field(default_factory=list)  # pulled, never written by push
    on_archive: ArchiveHook | None = None

    @property
    def fields(self) -> list[str]:
        return [f for f in self.model.model_fields if f != "deleted"]

    @property
    def writable(self) -> list[str]:
        return [f for f in self.fields if f not in self.server_owned]


def iso(value: datetime) -> str:
    # Same format as JavaScript's toISOString(), so documents round-trip unchanged
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def to_doc(table: SyncTable, row: dict) -> dict:
    doc = {}
    for name in table.fields:
        value = row[name]
        if isinstance(value, datetime):
            value = iso(value)
        elif isinstance(value, UUID):
            value = str(value)
        doc[name] = value
    doc["_deleted"] = row["archived_at"] is not None
    return doc


def pull(conn: Connection, table: SyncTable, seq: int, limit: int) -> dict:
    rows = conn.execute(
        sql.SQL("SELECT * FROM {} WHERE seq > %s ORDER BY seq LIMIT %s").format(
            sql.Identifier(table.name)
        ),
        (seq, limit),
    ).fetchall()
    last = rows[-1]["seq"] if rows else seq
    return {"documents": [to_doc(table, r) for r in rows], "checkpoint": {"seq": last}}


def push_sql(table: SyncTable) -> sql.Composed:
    t = sql.Identifier(table.name)
    cols = table.writable
    # created_at never changes after the first write
    updates = [
        sql.SQL("{c} = excluded.{c}").format(c=sql.Identifier(c))
        for c in cols
        if c not in ("id", "created_at")
    ]
    return sql.SQL(
        """
        INSERT INTO {t} ({cols}, archived_at, seq)
        VALUES ({values}, %(archived_at)s, nextval({seq_name}))
        ON CONFLICT (id) DO UPDATE
            SET {updates},
                -- archiving again keeps the first archive time (restore groups by it)
                archived_at = CASE WHEN excluded.archived_at IS NULL THEN NULL
                                   ELSE coalesce({t}.archived_at, excluded.archived_at) END,
                seq = nextval({seq_name})
            WHERE excluded.updated_at > {t}.updated_at
        RETURNING archived_at
        """
    ).format(
        t=t,
        cols=sql.SQL(", ").join(map(sql.Identifier, cols)),
        values=sql.SQL(", ").join(sql.Placeholder(c) for c in cols),
        updates=sql.SQL(",\n                ").join(updates),
        seq_name=sql.Literal(f"{table.name}_seq"),
    )


def push(conn: Connection, table: SyncTable, docs: list[SyncDoc]) -> list[dict]:
    """Latest updated_at wins. Returns the server's row for every document it didn't take."""
    query = push_sql(table)
    now = datetime.now(timezone.utc)
    conflicts = []
    for doc in docs:
        params = doc.model_dump(include=set(table.writable))
        params["archived_at"] = now if doc.deleted else None
        taken = conn.execute(query, params).fetchone()
        if taken is None:
            row = conn.execute(
                sql.SQL("SELECT * FROM {} WHERE id = %s").format(sql.Identifier(table.name)),
                (doc.id,),
            ).fetchone()
            conflicts.append(to_doc(table, row))
        elif doc.deleted and table.on_archive:
            table.on_archive(conn, doc.id, taken["archived_at"])
    log.info("push %s: %d docs, %d conflicts", table.name, len(docs), len(conflicts))
    return conflicts


def router(table: SyncTable) -> APIRouter:
    """GET /<table>/pull and POST /<table>/push. Mount it under the module's prefix."""
    r = APIRouter()
    model = table.model

    @r.get(f"/{table.name}/pull")
    def pull_route(
        seq: int = 0,
        limit: int = Query(100, ge=1, le=1000),
        conn: Connection = Depends(get_conn),
    ):
        return pull(conn, table, seq, limit)

    @r.post(f"/{table.name}/push")
    def push_route(docs: list[model], conn: Connection = Depends(get_conn)):  # type: ignore[valid-type]
        return push(conn, table, docs)

    return r
