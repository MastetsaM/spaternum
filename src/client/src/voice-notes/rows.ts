// Writes to the voice_notes collection. updated_at comes from the server-corrected clock,
// because the latest one wins on the server.

import type { RxDocument } from "rxdb";
import { serverNow } from "../sync/clock";
import type { Db, VoiceNote } from "../sync/db";
import { MIME } from "./logic";

type NewRecording = { id: string; recordedAtMs: number; durationMs: number; sizeBytes: number };

/** Created at Stop (or by recovery), so an unfinished recording never syncs. */
export async function createRow(db: Db, { id, recordedAtMs, durationMs, sizeBytes }: NewRecording): Promise<void> {
  const now = serverNow();
  await db.voice_notes.insert({
    id,
    title: "",
    tags: [],
    recorded_at: new Date(recordedAtMs).toISOString(),
    duration_ms: Math.round(durationMs),
    size_bytes: sizeBytes,
    mime_type: MIME,
    uploaded_at: null,
    created_at: now,
    updated_at: now,
  });
}

export async function saveEdits(doc: RxDocument<VoiceNote>, title: string, tags: string[]): Promise<void> {
  await doc.incrementalPatch({ title: title.trim(), tags, updated_at: serverNow() });
}

/** RxDB remove = archived on the server; a newer updated_at so the server takes it. */
export async function archive(doc: RxDocument<VoiceNote>): Promise<void> {
  const latest = await doc.incrementalPatch({ updated_at: serverNow() });
  await latest.remove();
}
