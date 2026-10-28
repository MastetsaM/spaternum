// Reading and writing notes and folders in the local database. Sync to the server is
// RxDB's job (sync/db.ts). Every write sets updated_at, so the latest write wins.

import { useEffect, useState } from "react";
import { serverNow } from "../sync/clock";
import type { RxCollection } from "rxdb";
import { getDb, type Db, type Folder, type Note } from "../sync/db";

/** Every active row of a collection, kept up to date; null while loading. */
function useRows<T>(pick: (db: Db) => RxCollection<T>): T[] | null {
  const [rows, setRows] = useState<T[] | null>(null);
  useEffect(() => {
    let sub: { unsubscribe(): void } | undefined;
    let closed = false; // the screen may close before the database is open
    getDb().then((db) => {
      if (closed) return;
      sub = pick(db).find().$.subscribe((docs) => setRows(docs.map((d) => d.toJSON() as T)));
    });
    return () => {
      closed = true;
      sub?.unsubscribe();
    };
  }, []); // the collection never changes
  return rows;
}

export const useNotes = () => useRows((db) => db.notes);
export const useFolders = () => useRows((db) => db.note_folders);

// ---- Notes ----

/**
 * Writes the body. With no row (a new note, or one archived meanwhile on another device),
 * creates it from `last`: the new note's fields, or the note as the editor last saw it.
 */
export async function saveBody(body: string, last: Note): Promise<void> {
  const db = await getDb();
  const now = serverNow();
  const doc = await db.notes.findOne(last.id).exec();
  if (doc) await doc.incrementalPatch({ body, updated_at: now });
  else await db.notes.insert({ ...last, body, updated_at: now });
}

/** A note that isn't stored yet: it gets a row at its first save with text. */
export function newNote(id: string, folderId: string | null): Note {
  const now = serverNow();
  return { id, body: "", folder_id: folderId, tags: [], pinned: false, created_at: now, updated_at: now };
}

/** Changes tags, pinned or folder. */
export async function updateNote(id: string, fields: Partial<Pick<Note, "tags" | "pinned" | "folder_id">>) {
  const db = await getDb();
  const doc = await db.notes.findOne(id).exec();
  await doc?.incrementalPatch({ ...fields, updated_at: serverNow() });
}

/** Archive = removal from the device; a new updated_at so the server takes it. */
export async function archiveNote(id: string): Promise<void> {
  const db = await getDb();
  const doc = await db.notes.findOne(id).exec();
  await doc?.incrementalModify((data) => ({ ...data, updated_at: serverNow(), _deleted: true }));
}

// ---- Folders ----

export async function createFolder(name: string, parentId: string | null): Promise<void> {
  const db = await getDb();
  const now = serverNow();
  await db.note_folders.insert({ id: crypto.randomUUID(), name, parent_id: parentId, created_at: now, updated_at: now });
}

export async function updateFolder(id: string, fields: Partial<Pick<Folder, "name" | "parent_id">>) {
  const db = await getDb();
  const doc = await db.note_folders.findOne(id).exec();
  await doc?.incrementalPatch({ ...fields, updated_at: serverNow() });
}

/**
 * Only the folder is written: the server archives what's inside with the same time and
 * sends those back as deletions, so a restore brings them all back together.
 */
export async function archiveFolder(id: string): Promise<void> {
  const db = await getDb();
  const doc = await db.note_folders.findOne(id).exec();
  await doc?.incrementalModify((data) => ({ ...data, updated_at: serverNow(), _deleted: true }));
}
