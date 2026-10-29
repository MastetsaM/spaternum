// Reading and writing calendar events in the local database. Sync to the server is RxDB's job
// (sync/db.ts). What to write for each edit is decided in calendar.ts; this file only stores it.

import { useEffect, useState } from "react";
import { serverNow } from "../sync/clock";
import { getDb } from "../sync/db";
import type { CalendarEvent, Ctx, Writes } from "./calendar";

/** The device's time zone, stored on new events (IANA name, e.g. "Europe/Lisbon"). */
export const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** The corrected clock and fresh ids, for the rules in calendar.ts. */
export const ctx = (): Ctx => ({ now: serverNow(), newId: () => crypto.randomUUID() });

/** Every active row (one-offs, series, exceptions), kept up to date; null while loading. */
export function useEvents(): CalendarEvent[] | null {
  const [rows, setRows] = useState<CalendarEvent[] | null>(null);
  useEffect(() => {
    let sub: { unsubscribe(): void } | undefined;
    let closed = false; // the screen may close before the database is open
    getDb().then((db) => {
      if (closed) return;
      sub = db.calendar_events
        .find()
        .$.subscribe((docs) => setRows(docs.map((d) => d.toJSON() as CalendarEvent)));
    });
    return () => {
      closed = true;
      sub?.unsubscribe();
    };
  }, []);
  return rows;
}

/**
 * Stores what calendar.ts decided: rows put as they are (they already carry updated_at), ids
 * archived = removed from the device with a new updated_at, so the server takes it.
 */
export async function write({ put, archive }: Writes): Promise<void> {
  const db = await getDb();
  if (put.length > 0) await db.calendar_events.bulkUpsert(put);
  for (const id of archive) {
    const doc = await db.calendar_events.findOne(id).exec();
    await doc?.incrementalModify((data) => ({ ...data, updated_at: serverNow(), _deleted: true }));
  }
}
