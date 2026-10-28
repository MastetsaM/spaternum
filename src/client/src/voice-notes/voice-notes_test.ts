import { describe, expect, it } from "vitest";
import {
  allTags,
  doneName,
  durationLabel,
  MAX_PART_MS,
  needsUpload,
  parseName,
  parseTags,
  partName,
  partOver,
  playSource,
  recoveryAction,
  sizeLabel,
  stateLabel,
  titleOf,
  uploadedName,
  uploadError,
  uploadState,
  visibleRows,
} from "./logic";

const ID = "0b7c2a7e-1f3d-4c5b-9a8e-123456789abc";

describe("file names", () => {
  it("reads a recording in progress, stopped, and uploaded", () => {
    expect(parseName(partName(ID, 1761645600000))).toEqual({
      name: `${ID}.1761645600000.part`,
      id: ID,
      done: false,
      uploaded: false,
      recordedAtMs: 1761645600000,
    });
    expect(parseName(doneName(ID))).toEqual({ name: `${ID}.webm`, id: ID, done: true, uploaded: false, recordedAtMs: null });
    expect(parseName(uploadedName(ID))).toEqual({
      name: `${ID}.uploaded.webm`,
      id: ID,
      done: true,
      uploaded: true,
      recordedAtMs: null,
    });
  });

  it("ignores other files", () => {
    expect(parseName("notes.txt")).toBeNull();
    expect(parseName(`${ID}.ogg`)).toBeNull();
    expect(parseName(`${ID}.part`)).toBeNull();
    expect(parseName(`${ID}.sent.webm`)).toBeNull();
  });
});

describe("recovery on start", () => {
  it("leaves an empty file alone", () => {
    expect(recoveryAction(0, false)).toBe("skip");
  });
  it("only renames when the row was already created", () => {
    expect(recoveryAction(4096, true)).toBe("rename");
  });
  it("creates the row for an interrupted recording", () => {
    expect(recoveryAction(4096, false)).toBe("create-row");
  });
});

describe("1-hour limit", () => {
  it("starts a new part at one hour, not before", () => {
    expect(partOver(0, MAX_PART_MS - 1)).toBe(false);
    expect(partOver(0, MAX_PART_MS)).toBe(true);
  });
});

describe("upload", () => {
  const done = parseName(doneName(ID))!;
  const part = parseName(partName(ID, 1))!;
  const uploaded = parseName(uploadedName(ID))!;

  it("uploads a stopped recording not uploaded yet", () => {
    expect(needsUpload(done, null)).toBe(true);
    expect(needsUpload(done, undefined)).toBe(true); // archived: row not in the local db
  });

  it("skips recordings still going, marked uploaded by the server, or named uploaded", () => {
    expect(needsUpload(part, null)).toBe(false);
    expect(needsUpload(done, "2026-10-28T10:00:00.000Z")).toBe(false);
    expect(needsUpload(uploaded, undefined)).toBe(false); // archived and already uploaded
    expect(needsUpload(uploaded, null)).toBe(false); // uploaded, the row's uploaded_at not pulled yet
  });

  it("shows the reason only for errors that aren't retried quietly", () => {
    expect(uploadError(0, "server not reachable")).toBeNull();
    expect(uploadError(404, "no voice note")).toBeNull();
    expect(uploadError(400, "size mismatch: got 1")).toBe("size mismatch");
    expect(uploadError(507, "server disk full")).toBe("server disk full");
    expect(uploadError(500, "")).toBe("error 500");
  });
});

describe("upload state", () => {
  const phone = { uploaded: false, recordsHere: true, hasFile: true, uploading: false, error: undefined };

  it("uploaded wins on every device", () => {
    expect(uploadState({ ...phone, uploaded: true, hasFile: false })).toEqual({ kind: "uploaded" });
    expect(uploadState({ ...phone, uploaded: true, recordsHere: false })).toEqual({ kind: "uploaded" });
  });

  it("the PC waits for the phone", () => {
    expect(uploadState({ ...phone, recordsHere: false, hasFile: false })).toEqual({ kind: "waiting" });
  });

  it("on the phone: missing, uploading, error, or local only", () => {
    expect(uploadState({ ...phone, hasFile: false })).toEqual({ kind: "missing" });
    expect(uploadState({ ...phone, uploading: true, error: "size mismatch" })).toEqual({ kind: "uploading" });
    expect(uploadState({ ...phone, error: "size mismatch" })).toEqual({ kind: "error", message: "size mismatch" });
    expect(uploadState(phone)).toEqual({ kind: "local" });
  });

  it("has a label for each state", () => {
    expect(stateLabel({ kind: "local" })).toBe("Not uploaded");
    expect(stateLabel({ kind: "error", message: "server disk full" })).toBe("Upload failed: server disk full");
    expect(stateLabel({ kind: "missing" })).toBe("Audio missing");
    expect(stateLabel({ kind: "waiting" })).toBe("Not uploaded yet");
  });
});

describe("playback source", () => {
  it("plays the local file first, even offline", () => {
    expect(playSource({ kind: "local" }, true, false)).toEqual({ from: "local" });
    expect(playSource({ kind: "uploaded" }, true, false)).toEqual({ from: "local" });
  });

  it("streams an uploaded recording when online", () => {
    expect(playSource({ kind: "uploaded" }, false, true)).toEqual({ from: "server" });
  });

  it("says why it can't play", () => {
    expect(playSource({ kind: "uploaded" }, false, false)).toEqual({ from: "none", reason: "offline" });
    expect(playSource({ kind: "waiting" }, false, true)).toEqual({ from: "none", reason: "not uploaded yet" });
    expect(playSource({ kind: "missing" }, false, true)).toEqual({ from: "none", reason: "audio missing" });
  });
});

describe("labels", () => {
  it("formats durations", () => {
    expect([0, 5_000, 65_400, 12 * 60_000, MAX_PART_MS, MAX_PART_MS + 61_000].map(durationLabel)).toEqual([
      "0:00",
      "0:05",
      "1:05",
      "12:00",
      "1:00:00",
      "1:01:01",
    ]);
  });

  it("formats sizes", () => {
    expect(sizeLabel(64 * 1024)).toBe("64 KB");
    expect(sizeLabel(2.5 * 1024 * 1024)).toBe("2.5 MB");
  });

  it("shows the date-time when there's no title", () => {
    const recorded_at = "2026-10-28T10:00:00.000Z";
    expect(titleOf({ title: " Idea ", recorded_at })).toBe("Idea");
    expect(titleOf({ title: "  ", recorded_at })).toBe(new Date(recorded_at).toLocaleString());
  });
});

describe("tags and order", () => {
  const rows = [
    { id: "a", tags: ["work"], recorded_at: "2026-10-27T10:00:00.000Z" },
    { id: "b", tags: [], recorded_at: "2026-10-28T10:00:00.000Z" },
    { id: "c", tags: ["idea", "work"], recorded_at: "2026-10-26T10:00:00.000Z" },
  ];

  it("reads comma-separated tags, without blanks or repeats", () => {
    expect(parseTags("idea, work ,, idea")).toEqual(["idea", "work"]);
    expect(parseTags("  ")).toEqual([]);
  });

  it("lists the tags in use", () => {
    expect(allTags(rows)).toEqual(["idea", "work"]);
  });

  it("filters by one tag, newest first", () => {
    expect(visibleRows(rows, null).map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(visibleRows(rows, "work").map((r) => r.id)).toEqual(["a", "c"]);
  });
});
