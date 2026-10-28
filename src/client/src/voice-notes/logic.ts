// Voice notes rules with no I/O, so they can be tested: file names, recovery, the 1-hour split,
// upload state, playback source, labels, tags. See the voice-notes spec, "Client details".

/** Settings proven in phase 0. */
export const MIME = "audio/webm;codecs=opus";
export const BITS_PER_SECOND = 32_000;
export const SLICE_MS = 5_000; // each piece is appended to the file at once
export const MAX_PART_MS = 60 * 60 * 1000;
export const RETRY_NOT_FOUND_MS = 30_000;

// ---- File names: <id>.<recorded_at ms>.part while recording, <id>.webm once stopped,
// <id>.uploaded.webm once the server has it

export type LocalFile = { name: string; id: string; done: boolean; uploaded: boolean; recordedAtMs: number | null };

export const doneName = (id: string) => `${id}.webm`;
export const uploadedName = (id: string) => `${id}.uploaded.webm`;
export const partName = (id: string, recordedAtMs: number) => `${id}.${recordedAtMs}.part`;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const DONE = new RegExp(`^(${UUID})(\\.uploaded)?\\.webm$`);
const PART = new RegExp(`^(${UUID})\\.(\\d+)\\.part$`);

/** Anything that isn't one of our three names is ignored. */
export function parseName(name: string): LocalFile | null {
  const done = DONE.exec(name);
  if (done) return { name, id: done[1], done: true, uploaded: Boolean(done[2]), recordedAtMs: null };
  const part = PART.exec(name);
  if (part) return { name, id: part[1], done: false, uploaded: false, recordedAtMs: Number(part[2]) };
  return null;
}

// ---- Recovery of a .part file found on start

export type Recovery = "skip" | "rename" | "create-row";

export function recoveryAction(sizeBytes: number, hasRow: boolean): Recovery {
  if (sizeBytes === 0) return "skip"; // killed before the first piece: no audio
  if (hasRow) return "rename"; // killed between creating the row and the rename
  return "create-row";
}

// ---- 1-hour limit

export function partOver(startedAtMs: number, nowMs: number): boolean {
  return nowMs - startedAtMs >= MAX_PART_MS;
}

// ---- Upload

/** A stopped recording still to upload. The row may be missing locally (archived); then the file name decides. */
export function needsUpload(file: LocalFile, uploadedAt: string | null | undefined): boolean {
  return file.done && !file.uploaded && !uploadedAt;
}

/** What to show after a failed upload; null = say nothing and retry (not reachable, row not pushed yet). */
export function uploadError(status: number, message: string): string | null {
  if (status === 0 || status === 404) return null;
  if (status === 400) return "size mismatch";
  if (status === 507) return "server disk full";
  return message.slice(0, 80) || `error ${status}`;
}

export type UploadState =
  | { kind: "uploaded" }
  | { kind: "uploading" }
  | { kind: "local" } // file on this phone, not uploaded
  | { kind: "error"; message: string }
  | { kind: "missing" } // on the phone: no file and not uploaded
  | { kind: "waiting" }; // on the PC: the phone hasn't uploaded it yet

type StateInput = {
  uploaded: boolean; // row's uploaded_at, or the file is named uploaded
  recordsHere: boolean; // this device keeps audio files (the phone)
  hasFile: boolean;
  uploading: boolean;
  error: string | undefined;
};

export function uploadState({ uploaded, recordsHere, hasFile, uploading, error }: StateInput): UploadState {
  if (uploaded) return { kind: "uploaded" };
  if (!recordsHere) return { kind: "waiting" };
  if (!hasFile) return { kind: "missing" };
  if (uploading) return { kind: "uploading" };
  if (error) return { kind: "error", message: error };
  return { kind: "local" };
}

export function stateLabel(state: UploadState): string {
  switch (state.kind) {
    case "uploaded":
      return "Uploaded";
    case "uploading":
      return "Uploading…";
    case "local":
      return "Not uploaded";
    case "error":
      return `Upload failed: ${state.message}`;
    case "missing":
      return "Audio missing";
    case "waiting":
      return "Not uploaded yet";
  }
}

// ---- Playback

export type PlaySource = { from: "local" } | { from: "server" } | { from: "none"; reason: string };

export function playSource(state: UploadState, hasFile: boolean, online: boolean): PlaySource {
  if (hasFile) return { from: "local" };
  if (state.kind === "missing") return { from: "none", reason: "audio missing" };
  if (state.kind !== "uploaded") return { from: "none", reason: "not uploaded yet" };
  if (!online) return { from: "none", reason: "offline" };
  return { from: "server" };
}

// ---- Labels

/** 5 s → "0:05", 12 min → "12:00", 1 h → "1:00:00" */
export function durationLabel(ms: number): string {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** Under 1 MB in KB, else MB with one decimal. */
export function sizeLabel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The title, or the recording's date-time in local time when there's none. */
export function titleOf(row: { title: string; recorded_at: string }): string {
  return row.title.trim() || new Date(row.recorded_at).toLocaleString();
}

// ---- Tags and list order

/** "idea, work ,, idea" → ["idea", "work"] */
export function parseTags(input: string): string[] {
  return [...new Set(input.split(",").map((tag) => tag.trim()).filter(Boolean))];
}

/** Every tag in use, sorted, for the filter. */
export function allTags(rows: { tags: string[] }[]): string[] {
  return [...new Set(rows.flatMap((row) => row.tags))].sort((a, b) => a.localeCompare(b));
}

/** Newest first, only those with the tag (all when tag is null). */
export function visibleRows<T extends { tags: string[]; recorded_at: string }>(rows: T[], tag: string | null): T[] {
  return rows
    .filter((row) => tag === null || row.tags.includes(tag))
    .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));
}
