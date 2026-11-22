// The recorder (Android only), with the settings proven in phase 0. Lives outside React so a
// recording keeps going when another screen is opened.
// Each ~5 s piece is appended to <id>.<recorded_at>.<note id>.part at once; at Stop the row is created
// and the file renamed to <id>.webm. At 1 hour the next part starts on the same mic before the old
// one stops, in the same note.

import { useSyncExternalStore } from "react";
import { serverNow } from "../../sync/clock";
import { getDb } from "../../sync/db";
import { appendFile, fileSize, renameFile } from "./files";
import { BITS_PER_SECOND, doneName, MIME, partName, partOver, SLICE_MS } from "./logic";
import { createRecording, type Target } from "./rows";
import { recovered, refreshFiles, uploadAfterRecording } from "./uploads";

export type Recorder = {
  phase: "idle" | "asking" | "recording" | "saving";
  startedAt: number; // device time the current part started, for the timer
  error: string;
  noteId: string | null; // the note being recorded into
};

let state: Recorder = { phase: "idle", startedAt: 0, error: "", noteId: null };
const listeners = new Set<() => void>();

function set(next: Partial<Recorder>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

export function useRecorder(): Recorder {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

type Part = {
  id: string;
  name: string;
  recordedAtMs: number; // server clock, for recorded_at
  startedAt: number; // device clock, for the duration
  recorder: MediaRecorder;
  bytes: number; // written so far
  writes: Promise<void>; // appends run one after another, in order
  failed: unknown;
};

let stream: MediaStream | null = null;
let target: Target | null = null;
let current: Part | null = null;
let splitTimer: ReturnType<typeof setInterval> | undefined;

function startPart(mic: MediaStream, to: Target): Part {
  const id = crypto.randomUUID();
  const recordedAtMs = Date.parse(serverNow());
  const recorder = new MediaRecorder(mic, { mimeType: MIME, audioBitsPerSecond: BITS_PER_SECOND });
  const part: Part = {
    id,
    name: partName(id, recordedAtMs, to.noteId),
    recordedAtMs,
    startedAt: Date.now(),
    recorder,
    bytes: 0,
    writes: Promise.resolve(),
    failed: null,
  };
  recorder.ondataavailable = (event) => {
    if (!event.data.size) return;
    part.writes = part.writes.then(async () => {
      if (part.failed) return; // a gap in the middle would break the file; keep what's there
      try {
        const bytes = new Uint8Array(await event.data.arrayBuffer());
        await appendFile(part.name, bytes);
        part.bytes += bytes.length;
      } catch (e) {
        part.failed = e;
        if (current === part) stopRecording(`Writing the recording failed: ${e}`);
      }
    });
  };
  recorder.start(SLICE_MS);
  return part;
}

/** Stops the part, waits for its last piece on disk, then creates the row and renames the file. */
async function finishPart(part: Part, to: Target): Promise<void> {
  await new Promise((resolve) => {
    part.recorder.onstop = resolve;
    part.recorder.stop();
  });
  await part.writes;
  if (part.failed) throw part.failed; // the .part file stays; recovery picks it up on next start
  if (part.bytes === 0) return; // stopped before any audio arrived: no file, no row
  const sizeBytes = await fileSize(part.name);
  await createRecording(await getDb(), {
    ...to,
    id: part.id,
    recordedAtMs: part.recordedAtMs,
    durationMs: Date.now() - part.startedAt,
    sizeBytes,
  });
  await renameFile(part.name, doneName(part.id));
}

/** Records into the note (created at Stop if it doesn't exist yet). One recording at a time. */
export async function startRecording(to: Target): Promise<void> {
  if (state.phase !== "idle") return;
  target = to;
  set({ phase: "asking", error: "", noteId: to.noteId });
  await recovered();
  if (!MediaRecorder.isTypeSupported(MIME)) return set({ phase: "idle", error: `${MIME} isn't supported here.`, noteId: null });
  try {
    // The defaults are tuned for calls and make recordings sound muffled
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch (e) {
    return set({ phase: "idle", error: `Microphone not available: ${e}`, noteId: null });
  }
  current = startPart(stream, to);
  set({ phase: "recording", startedAt: current.startedAt });
  splitTimer = setInterval(splitIfLong, 1000);
}

/** At the 1-hour limit: start the next part first, then stop this one, so nothing falls between. */
function splitIfLong() {
  if (!current || !stream || !target || !partOver(current.startedAt, Date.now())) return;
  const old = current;
  current = startPart(stream, target);
  set({ startedAt: current.startedAt });
  finishPart(old, target)
    .then(() => refreshFiles())
    .then(() => uploadAfterRecording())
    .catch((e) => set({ error: `Saving the first part failed: ${e}` }));
}

export async function stopRecording(error = ""): Promise<void> {
  if (state.phase !== "recording" || !current) return;
  set({ phase: "saving", error });
  clearInterval(splitTimer);
  const part = current;
  const to = target!;
  current = null;
  try {
    await finishPart(part, to);
  } catch (e) {
    set({ error: error || `Saving failed: ${e}` });
  } finally {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    target = null;
    set({ phase: "idle", noteId: null });
  }
  await refreshFiles().catch(() => {});
  uploadAfterRecording();
}
