// On the device that records (the phone): recovery of interrupted recordings on start, and the
// upload queue — on start, after each recording, when sync turns online. Started once from main.tsx.
// Also a small store of what the list needs to know: which files are here, what's uploading, errors.

import { useSyncExternalStore } from "react";
import { ApiError, call } from "../api/client";
import type { Settings } from "../api/settings";
import { getDb, type Db } from "../sync/db";
import { onStatusChange } from "../sync/status";
import { durationOf } from "./audio";
import { fileSize, listFiles, readAudio, renameFile } from "./files";
import { doneName, needsUpload, parseName, recoveryAction, RETRY_NOT_FOUND_MS, uploadError, type LocalFile } from "./logic";
import { createRow } from "./rows";

/** Recording and local audio happen on Android only; the PC views and streams. */
export const RECORDS_HERE = /android/i.test(navigator.userAgent);

export type Uploads = {
  files: Set<string>; // ids with a stopped recording on this device
  uploaded: Set<string>; // ids this device has uploaded (kept across restarts)
  uploading: string | null;
  errors: Record<string, string>;
};

// Archived rows leave the local database, but their pending upload must keep going, so the
// device remembers what it uploaded itself. Losing this only causes harmless repeat uploads.
const UPLOADED_KEY = "spaternum.voice-notes.uploaded";

function loadUploaded(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(UPLOADED_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

let state: Uploads = { files: new Set(), uploaded: loadUploaded(), uploading: null, errors: {} };
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
  set({ files: new Set(files.filter((f) => f.done).map((f) => f.id)) });
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

async function uploadPending(settings: Settings): Promise<void> {
  const db = await getDb();
  for (const file of await refreshFiles()) {
    const row = await db.voice_notes.findOne(file.id).exec();
    if (!needsUpload(file, row?.uploaded_at, state.uploaded)) continue;

    set({ uploading: file.id });
    try {
      const body = await readAudio(file.name);
      await call(settings, `/api/voice-notes/${file.id}/audio`, {
        method: "PUT",
        body,
        headers: { "Content-Type": "audio/webm" },
      });
      const uploaded = new Set(state.uploaded).add(file.id);
      localStorage.setItem(UPLOADED_KEY, JSON.stringify([...uploaded]));
      const { [file.id]: _, ...errors } = state.errors;
      set({ uploaded, errors });
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
    runUploads();
  })();
  return started;
}

/** Resolves once recovery has run, so a new recording's file is never taken for an interrupted one. */
export function recovered(): Promise<void> {
  return started ?? Promise.resolve();
}
