// Reading and writing notes and folders in the local database. Sync to the server is
// RxDB's job (sync/db.ts). Every write sets updated_at, so the latest write wins.

import { useEffect, useState } from "react";
import { serverNow } from "../sync/clock";
import type { RxCollection } from "rxdb";
import { getDb, type Db, type Folder, type Note } from "../sync/db";
import { hideArchivedContents, type Content } from "./notes";

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

/**
 * Active notes and folders, without what's inside a folder this device archived
 * (see hideArchivedContents); null while loading.
 */
export function useNotesAndFolders(): { notes: Note[]; folders: Folder[] } | null {
  const notes = useRows((db) => db.notes);
  const folders = useRows((db) => db.note_folders);
  if (!notes || !folders) return null;
  return hideArchivedContents(folders, notes, archivedHere());
}

// Folders archived on this device: id → archive time. Kept on the device, so a restart while
// offline still hides their contents. Old entries are harmless (see hideArchivedContents).
const ARCHIVED_KEY = "spaternum.archivedFolders";

function archivedHere(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(ARCHIVED_KEY) ?? "{}");
  } catch {
    return {};
  }
}

// ---- Notes ----

/**
 * Writes the title and body. With no row (a new note, or one archived meanwhile on another
 * device), creates it from `last`: the new note's fields, or the note as the editor last saw it.
 */
export async function saveContent({ title, body }: Content, last: Note): Promise<void> {
  const db = await getDb();
  const now = serverNow();
  const doc = await db.notes.findOne(last.id).exec();
  if (doc) await doc.incrementalPatch({ title, body, updated_at: now });
  else await db.notes.insert({ ...last, title, body, updated_at: now });
}

/** A note that isn't stored yet: it gets a row at its first save with text. */
export function newNote(id: string, folderId: string | null): Note {
  const now = serverNow();
  return { id, title: "", body: "", folder_id: folderId, tags: [], pinned: false, created_at: now, updated_at: now };
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
 * sends those back as deletions, so a restore brings them all back together. Until then the
 * screen hides the contents (useNotesAndFolders).
 */
export async function archiveFolder(id: string): Promise<void> {
  const db = await getDb();
  const doc = await db.note_folders.findOne(id).exec();
  if (!doc) return;
  const at = serverNow();
  // Noted before the write, so the screen hides the contents as soon as the folder goes
  localStorage.setItem(ARCHIVED_KEY, JSON.stringify({ ...archivedHere(), [id]: at }));
  await doc.incrementalModify((data) => ({ ...data, updated_at: at, _deleted: true }));
}
