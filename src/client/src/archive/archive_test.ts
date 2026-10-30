import { describe, expect, it } from "vitest";
import { ApiError } from "../api/client";
import { errorMessage, FILTERS, formatDateTime, itemKind, itemTitle, typeLabel, type ArchivedItem } from "./archive";

const item = (over: Partial<ArchivedItem>): ArchivedItem => ({
  module: "notes",
  type: "note",
  id: "00000000-0000-0000-0000-000000000001",
  title: "Shopping",
  archived_at: "2026-10-28T10:00:00Z",
  items: 0,
  ...over,
});

describe("archive display", () => {
  it("formats times in local time", () => {
    // Built from local parts, so the test passes in any time zone
    const local = new Date(2026, 9, 8, 7, 5);
    expect(formatDateTime(local.toISOString())).toBe("2026-10-08 07:05");
  });

  it("uses the title, or the recording time for an untitled voice note", () => {
    expect(itemTitle(item({}))).toBe("Shopping");
    const recorded = new Date(2026, 9, 27, 18, 30).toISOString();
    expect(itemTitle(item({ type: "voice_note", title: "", recorded_at: recorded }))).toBe("2026-10-27 18:30");
    expect(itemTitle(item({ type: "voice_note", title: " ", recorded_at: null }))).toBe("(untitled)");
  });

  it("labels types, and counts what was archived with a folder", () => {
    expect(itemKind(item({}))).toBe("Note");
    expect(itemKind(item({ type: "voice_note" }))).toBe("Voice note");
    expect(itemKind(item({ type: "folder", items: 1 }))).toBe("Folder · 1 item");
    expect(itemKind(item({ type: "folder", items: 50 }))).toBe("Folder · 50 items");
    expect(typeLabel("task")).toBe("task"); // a future module still shows something
  });

  it("labels calendar events, and counts a series' changed occurrences", () => {
    expect(itemKind(item({ module: "calendar", type: "event" }))).toBe("Event");
    expect(itemKind(item({ module: "calendar", type: "series" }))).toBe("Repeating event");
    expect(itemKind(item({ module: "calendar", type: "series", items: 1 }))).toBe("Repeating event · 1 changed occurrence");
    expect(itemKind(item({ module: "calendar", type: "series", items: 3 }))).toBe("Repeating event · 3 changed occurrences");
  });

  it("offers All plus one filter per server type", () => {
    expect(FILTERS.map((f) => f.type)).toEqual(["", "note", "folder", "voice_note", "event", "series"]);
  });

  it("explains failures", () => {
    expect(errorMessage(new ApiError(0, "server not reachable"))).toMatch(/needs the server/);
    expect(errorMessage(new ApiError(500, "boom"))).toBe("Server error 500");
  });
});
