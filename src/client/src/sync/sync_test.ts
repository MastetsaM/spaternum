import { afterEach, describe, expect, it, vi } from "vitest";
import { offsetFrom, serverNow, updateOffset } from "./clock";
import { parseEvents, reconnectDelay } from "./events";
import { currentStatus, markSynced, markSyncFailed, syncWarnings } from "./status";

describe("clock offset", () => {
  it("measures server minus device time from the Date header", () => {
    // Request sent at 10:00:00.000 and answered at 10:00:01.000 device time;
    // the server said 10:00:05 (whole seconds), so it's ~5 s ahead
    const sent = Date.parse("2026-10-26T10:00:00.000Z");
    const offset = offsetFrom("Mon, 26 Oct 2026 10:00:05 GMT", sent, sent + 1000);
    expect(offset).toBe(5000);
  });

  it("ignores a missing or broken header", () => {
    expect(offsetFrom(null, 0, 0)).toBeNull();
    expect(offsetFrom("not a date", 0, 0)).toBeNull();
  });

  afterEach(() => vi.useRealTimers());

  it("corrects timestamps written by the device", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-10-26T10:00:00.000Z"));
    updateOffset("Mon, 26 Oct 2026 10:01:00 GMT", Date.now(), Date.now());
    expect(serverNow()).toBe("2026-10-26T10:01:00.500Z");
  });
});

describe("live stream", () => {
  it("reads table names from complete events and keeps the rest", () => {
    const { tables, rest } = parseEvents(": connected\n\ndata: notes\n\n: keepalive\n\ndata: voice_no");
    expect(tables).toEqual(["notes"]);
    expect(rest).toBe("data: voice_no");
    expect(parseEvents(rest + "tes\n\n").tables).toEqual(["voice_notes"]);
  });

  it("waits longer after each failed reconnect, up to 30 s", () => {
    expect([0, 1, 2, 3, 4, 5, 10].map(reconnectDelay)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  });
});

describe("sync warning", () => {
  it("writes one line per module, with the server's answer", () => {
    expect(syncWarnings({})).toEqual([]);
    expect(syncWarnings({ "calendar_events pull": 404 })).toEqual(["Calendar isn't syncing (server: 404)"]);
    expect(syncWarnings({ "calendar_events pull": 404, "calendar_events push": 404 })).toEqual([
      "Calendar isn't syncing (server: 404)",
    ]);
    expect(syncWarnings({ "notes push": 500, "note_folders pull": 404 })).toEqual(["Notes isn't syncing (server: 404, 500)"]);
  });

  it("clears a module after a success", () => {
    markSyncFailed("voice_notes pull", 502);
    expect(syncWarnings(currentStatus().failing)).toEqual(["Voice notes isn't syncing (server: 502)"]);
    markSynced("voice_notes pull");
    expect(currentStatus().failing).toEqual({});
  });
});
