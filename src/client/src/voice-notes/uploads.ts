// On the device that records (the phone): recovery of interrupted recordings on start, and the
// upload queue — on start, after each recording, when sync turns online. Started once from main.tsx.
// Also a small store of what the list needs to know: which files are here, what's uploading, errors.

import { useSyncExternalStore } from "react";
import { ApiError, call } from "../api/client";
import type { Settings } from "../api/settings";
import { awaitInSync, getDb, type Db } from "../sync/db";
import { onStatusChange } from "../sync/status";
import { durationOf } from "./audio";
import { fileSize, listFiles, readAudio, renameFile } from "./files";
import {
  doneName,
  needsUpload,
  parseName,
  PUSH_WAIT_MS,
  recoveryAction,
  RETRY_NOT_FOUND_MS,
  uploadedName,
  uploadError,
  type LocalFile,
} from "./logic";
import { createRow } from "./rows";

/** Recording and local audio happen on Android only; the PC views and streams. */
export const RECORDS_HERE = /android/i.test(navigator.userAgent);

export type Uploads = {
  files: Map<string, LocalFile>; // stopped recordings on this device, by id (uploaded or not)
  uploading: string | null;
  errors: Record<string, string>;
};

let state: Uploads = { files: new Map(), uploading: null, errors: {} };
const listeners = new Set<() => void>();

function set(next: Partial<Uploads>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

export function useUploads(): Uploads {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

async function localFiles(): Promise<LocalFile[]> {
  return (await listFiles()).map(parseName).filter((file) => file !== null);
}

/** Re-reads which stopped recordings are on this device. */
export async function refreshFiles(): Promise<LocalFile[]> {
  const files = await localFiles();
  set({ files: new Map(files.filter((f) => f.done).map((f) => [f.id, f])) });
  return files;
}

/** .part files left by a crash or a killed app become recordings like any other. */
async function recover(db: Db): Promise<void> {
  for (const file of await localFiles()) {
    if (file.done) continue;
    try {
      const sizeBytes = await fileSize(file.name);
      const row = await db.voice_notes.findOne(file.id).exec();
      const action = recoveryAction(sizeBytes, row !== null);
      if (action === "skip") continue;
      if (action === "create-row") {
        const durationMs = await durationOf(await readAudio(file.name));
        await createRow(db, { id: file.id, recordedAtMs: file.recordedAtMs!, durationMs, sizeBytes });
      }
      await renameFile(file.name, doneName(file.id));
      console.info(`voice notes: recovered ${file.name}`);
    } catch (e) {
      console.error(`voice notes: recovery of ${file.name} failed`, e);
    }
  }
}

let settings: Settings | null = null;
let running = false;
let again = false;
let retryTimer: ReturnType<typeof setTimeout> | undefined;

/** Uploads every pending recording, one at a time. Safe to call any time; calls during a run queue one more run. */
export async function runUploads(): Promise<void> {
  if (!settings || !RECORDS_HERE) return;
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    do {
      again = false;
      await uploadPending(settings);
    } while (again);
  } catch (e) {
    console.error("voice notes: upload run failed", e);
  } finally {
    running = false;
  }
}

/**
 * After a recording: wait until its row has been pushed, so the upload isn't refused with a 404.
 * Offline the push never finishes, so stop waiting after a while; the 404 retry stays as a fallback.
 */
export async function uploadAfterRecording(): Promise<void> {
  await Promise.race([
    awaitInSync("voice_notes").catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, PUSH_WAIT_MS)),
  ]);
  await runUploads();
}

async function uploadPending(settings: Settings): Promise<void> {
  const db = await getDb();
  for (const file of await refreshFiles()) {
    const row = await db.voice_notes.findOne(file.id).exec();
    if (!needsUpload(file, row?.uploaded_at)) continue;

    set({ uploading: file.id });
    try {
      const body = await readAudio(file.name);
      await call(settings, `/api/voice-notes/${file.id}/audio`, {
        method: "PUT",
        body,
        headers: { "Content-Type": "audio/webm" },
      });
      // The name marks it uploaded, also for archived rows that left the local database.
      // If the rename fails, the next run uploads again: the server answers "already uploaded".
      await renameFile(file.name, uploadedName(file.id));
      const { [file.id]: _, ...errors } = state.errors;
      set({ errors });
      await refreshFiles();
    } catch (e) {
      const status = e instanceof ApiError ? e.status : -1;
      const shown = uploadError(status, e instanceof Error ? e.message : String(e));
      if (shown) set({ errors: { ...state.errors, [file.id]: shown } });
      // The row hasn't reached the server yet: try again soon
      if (status === 404) {
        clearTimeout(retryTimer);
        retryTimer = setTimeout(runUploads, RETRY_NOT_FOUND_MS);
      }
      // Server not reachable: the rest would fail too; sync turning online starts the next run
      if (status === 0) return;
    } finally {
      set({ uploading: null });
    }
  }
}

let started: Promise<void> | null = null;

/** Recovery, then the first upload run; later runs when sync turns online. Resolves once recovery is done. */
export function startVoiceNotes(appSettings: Settings): Promise<void> {
  if (!RECORDS_HERE) return Promise.resolve();
  settings = appSettings;
  started ??= (async () => {
    let online = false;
    onStatusChange((status) => {
      if (status.online && !online) runUploads();
      online = status.online;
    });
    await refreshFiles().catch(() => {}); // so the list doesn't show "audio missing" meanwhile
    await recover(await getDb()).catch((e) => console.error("voice notes: recovery failed", e));
    uploadAfterRecording(); // recovered rows were just created too
  })();
  return started;
}

/** Resolves once recovery has run, so a new recording's file is never taken for an interrupted one. */
export function recovered(): Promise<void> {
  return started ?? Promise.resolve();
}
