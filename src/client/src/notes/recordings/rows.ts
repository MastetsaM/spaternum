// Writes to the note_recordings collection. updated_at comes from the server-corrected clock,
// because the latest one wins on the server.

import { serverNow } from "../../sync/clock";
import type { Db } from "../../sync/db";
import { newNote } from "../store";
import { MIME } from "./logic";

/** Where a recording goes: its note, and the folder for that note if it doesn't exist yet. */
export type Target = { noteId: string; folderId: string | null };

type NewRecording = Target & { id: string; recordedAtMs: number; durationMs: number; sizeBytes: number };

/**
 * Created at Stop (or by recovery), so an unfinished recording never syncs. The note is created
 * if it isn't there (Record in the list, or in a new note with no text yet); otherwise the
 * recording counts as an edit and moves the note up its list.
 */
export async function createRecording(db: Db, rec: NewRecording): Promise<void> {
  const now = serverNow();
  const note = await db.notes.findOne(rec.noteId).exec();
  if (note) await note.incrementalPatch({ updated_at: now });
  else await db.notes.insert({ ...newNote(rec.noteId, rec.folderId), created_at: now, updated_at: now });

  await db.note_recordings.insert({
    id: rec.id,
    note_id: rec.noteId,
    recorded_at: new Date(rec.recordedAtMs).toISOString(),
    duration_ms: Math.round(rec.durationMs),
    size_bytes: rec.sizeBytes,
    mime_type: MIME,
    uploaded_at: null,
    created_at: now,
    updated_at: now,
  });
}

/**
 * Removed = archived on the server; the note stays. One write with a newer updated_at: as two
 * writes (patch, then remove) the removal could be pushed alone with the same updated_at, and
 * the server refuses that.
 */
export async function archiveRecording(db: Db, id: string): Promise<void> {
  const doc = await db.note_recordings.findOne(id).exec();
  await doc?.incrementalModify((data) => ({ ...data, updated_at: serverNow(), _deleted: true }));
}
