import { describe, expect, it } from "vitest";
import {
  applyChange,
  archiveOccurrence,
  fromRRule,
  newEvent,
  occurrences,
  toRRule,
  validTimes,
  type CalendarEvent,
  type Ctx,
  type Occurrence,
  type Repeat,
} from "./calendar";

const TZ = "Europe/Lisbon";
const T = "2026-10-01T00:00:00.000Z";
const NOW = "2026-10-29T12:00:00.000Z";

function ev(id: string, fields: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id,
    title: id,
    notes: "",
    all_day: false,
    start_at: "2026-10-19T09:00:00.000Z", // Monday 10:00 in Lisbon (summer time)
    end_at: "2026-10-19T10:00:00.000Z",
    time_zone: TZ,
    rrule: null,
    series_id: null,
    original_start: null,
    cancelled: false,
    show_as: "busy",
    created_at: T,
    updated_at: T,
    ...fields,
  };
}

/** An exception of `series` replacing the occurrence at `original`. */
function exc(id: string, series: string, original: string, fields: Partial<CalendarEvent> = {}): CalendarEvent {
  return ev(id, { series_id: series, original_start: original, start_at: original, ...fields });
}

function ctx(): Ctx {
  let n = 0;
  return { now: NOW, newId: () => `new${++n}` };
}

const starts = (list: Occurrence[]) => list.map((o) => o.start);

/** The plain occurrence of `series` starting at `start`, as occurrences() would draw it. */
function occOf(events: CalendarEvent[], seriesId: string, start: string): Occurrence {
  const found = occurrences(events, start, new Date(Date.parse(start) + 1).toISOString()).find(
    (o) => o.seriesId === seriesId && o.start === start,
  );
  if (!found) throw new Error(`no occurrence at ${start}`);
  return found;
}

describe("occurrences: one-off", () => {
  const one = ev("a");

  it("shows a one-off inside the range", () => {
    expect(occurrences([one], "2026-10-19T00:00:00.000Z", "2026-10-20T00:00:00.000Z")).toEqual([
      {
        key: "a",
        eventId: "a",
        seriesId: null,
        originalStart: null,
        title: "a",
        allDay: false,
        start: "2026-10-19T09:00:00.000Z",
        end: "2026-10-19T10:00:00.000Z",
        showAs: "busy",
        broken: false,
      },
    ]);
  });

  it("hides a one-off outside the range", () => {
    expect(occurrences([one], "2026-10-20T00:00:00.000Z", "2026-10-21T00:00:00.000Z")).toEqual([]);
    expect(occurrences([one], "2026-10-18T00:00:00.000Z", "2026-10-19T09:00:00.000Z")).toEqual([]);
    expect(occurrences([one], "2026-10-19T10:00:00.000Z", "2026-10-20T00:00:00.000Z")).toEqual([]);
  });

  it("shows a one-off overlapping either edge", () => {
    expect(occurrences([one], "2026-10-19T09:30:00.000Z", "2026-10-20T00:00:00.000Z")).toHaveLength(1);
    expect(occurrences([one], "2026-10-18T00:00:00.000Z", "2026-10-19T09:30:00.000Z")).toHaveLength(1);
  });

  it("gives all-day one-offs as dates, end exclusive", () => {
    const day = ev("d", { all_day: true, start_at: "2026-10-18T23:00:00.000Z", end_at: "2026-10-20T23:00:00.000Z" });
    const [o] = occurrences([day], "2026-10-19T00:00:00.000Z", "2026-10-20T00:00:00.000Z");
    expect([o.start, o.end, o.allDay]).toEqual(["2026-10-19", "2026-10-21", true]);
  });

  it("sorts by start", () => {
    const late = ev("late", { start_at: "2026-10-19T15:00:00.000Z", end_at: "2026-10-19T16:00:00.000Z" });
    const early = ev("early", { start_at: "2026-10-19T07:00:00.000Z", end_at: "2026-10-19T08:00:00.000Z" });
    const daily = ev("s", { rrule: "FREQ=DAILY" });
    const list = occurrences([late, daily, early], "2026-10-19T00:00:00.000Z", "2026-10-21T00:00:00.000Z");
    expect(list.map((o) => o.eventId)).toEqual(["early", "s", "late", "s"]);
  });
});

describe("occurrences: series", () => {
  const range = (rrule: string, from: string, to: string, fields: Partial<CalendarEvent> = {}) =>
    starts(occurrences([ev("s", { rrule, ...fields })], from, to));

  it("repeats daily", () => {
    expect(range("FREQ=DAILY", "2026-10-20T00:00:00.000Z", "2026-10-23T00:00:00.000Z")).toEqual([
      "2026-10-20T09:00:00.000Z",
      "2026-10-21T09:00:00.000Z",
      "2026-10-22T09:00:00.000Z",
    ]);
  });

  it("repeats weekly on several days", () => {
    expect(range("FREQ=WEEKLY;BYDAY=MO,WE,FR", "2026-10-19T00:00:00.000Z", "2026-10-24T00:00:00.000Z")).toEqual([
      "2026-10-19T09:00:00.000Z",
      "2026-10-21T09:00:00.000Z",
      "2026-10-23T09:00:00.000Z",
    ]);
  });

  it("repeats monthly on the same date", () => {
    expect(range("FREQ=MONTHLY", "2026-10-01T00:00:00.000Z", "2026-12-31T00:00:00.000Z")).toEqual([
      "2026-10-19T09:00:00.000Z",
      "2026-11-19T10:00:00.000Z",
      "2026-12-19T10:00:00.000Z",
    ]);
  });

  it("repeats yearly", () => {
    expect(range("FREQ=YEARLY", "2026-01-01T00:00:00.000Z", "2029-01-01T00:00:00.000Z")).toEqual([
      "2026-10-19T09:00:00.000Z",
      "2027-10-19T09:00:00.000Z",
      "2028-10-19T09:00:00.000Z",
    ]);
  });

  it("honours INTERVAL", () => {
    expect(range("FREQ=DAILY;INTERVAL=3", "2026-10-19T00:00:00.000Z", "2026-10-26T00:00:00.000Z")).toEqual([
      "2026-10-19T09:00:00.000Z",
      "2026-10-22T09:00:00.000Z",
      "2026-10-25T10:00:00.000Z",
    ]);
  });

  it("honours COUNT", () => {
    expect(range("FREQ=DAILY;COUNT=2", "2026-10-01T00:00:00.000Z", "2026-11-01T00:00:00.000Z")).toHaveLength(2);
  });

  it("honours COUNT when the range starts after the first occurrences", () => {
    expect(range("FREQ=DAILY;COUNT=3", "2026-10-20T00:00:00.000Z", "2026-11-01T00:00:00.000Z")).toEqual([
      "2026-10-20T09:00:00.000Z",
      "2026-10-21T09:00:00.000Z",
    ]);
  });

  it("honours UNTIL", () => {
    expect(
      range("FREQ=DAILY;UNTIL=20261021T225959Z", "2026-10-01T00:00:00.000Z", "2026-11-01T00:00:00.000Z"),
    ).toEqual(["2026-10-19T09:00:00.000Z", "2026-10-20T09:00:00.000Z", "2026-10-21T09:00:00.000Z"]);
  });

  it("keeps 10:00 local across the October clock change", () => {
    expect(range("FREQ=WEEKLY;BYDAY=MO", "2026-10-19T00:00:00.000Z", "2026-10-27T00:00:00.000Z")).toEqual([
      "2026-10-19T09:00:00.000Z",
      "2026-10-26T10:00:00.000Z",
    ]);
  });

  it("keeps 10:00 local across the March clock change", () => {
    const winter = { start_at: "2026-03-16T10:00:00.000Z", end_at: "2026-03-16T11:00:00.000Z" };
    expect(range("FREQ=WEEKLY;BYDAY=MO", "2026-03-20T00:00:00.000Z", "2026-04-01T00:00:00.000Z", winter)).toEqual([
      "2026-03-23T10:00:00.000Z",
      "2026-03-30T09:00:00.000Z",
    ]);
  });

  it("keeps each occurrence's length", () => {
    const s = ev("s", { rrule: "FREQ=DAILY", end_at: "2026-10-19T09:45:00.000Z" });
    const [o] = occurrences([s], "2026-10-21T00:00:00.000Z", "2026-10-22T00:00:00.000Z");
    expect([o.start, o.end]).toEqual(["2026-10-21T09:00:00.000Z", "2026-10-21T09:45:00.000Z"]);
  });

  it("shows an occurrence that started before the range", () => {
    const s = ev("s", { rrule: "FREQ=DAILY", end_at: "2026-10-19T12:00:00.000Z" });
    expect(starts(occurrences([s], "2026-10-21T11:00:00.000Z", "2026-10-21T13:00:00.000Z"))).toEqual([
      "2026-10-21T09:00:00.000Z",
    ]);
  });

  it("keys plain occurrences by series and start", () => {
    const [o] = occurrences([ev("s", { rrule: "FREQ=DAILY" })], "2026-10-20T00:00:00.000Z", "2026-10-21T00:00:00.000Z");
    expect([o.key, o.eventId, o.seriesId, o.originalStart]).toEqual([
      "s@2026-10-20T09:00:00.000Z",
      "s",
      "s",
      "2026-10-20T09:00:00.000Z",
    ]);
  });

  it("gives all-day series as dates, end exclusive, across the clock change", () => {
    const s = ev("s", {
      all_day: true,
      rrule: "FREQ=DAILY",
      start_at: "2026-10-23T23:00:00.000Z", // 24 Oct, midnight in Lisbon
      end_at: "2026-10-24T23:00:00.000Z",
    });
    const list = occurrences([s], "2026-10-24T00:00:00.000Z", "2026-10-27T00:00:00.000Z");
    expect(list.map((o) => [o.start, o.end])).toEqual([
      ["2026-10-24", "2026-10-25"],
      ["2026-10-25", "2026-10-26"],
      ["2026-10-26", "2026-10-27"],
    ]);
  });

  it("expands a year of an endless daily series quickly", () => {
    const s = ev("s", { rrule: "FREQ=DAILY", start_at: "2020-01-01T10:00:00.000Z", end_at: "2020-01-01T11:00:00.000Z" });
    const t = performance.now();
    const list = occurrences([s], "2026-01-01T00:00:00.000Z", "2027-01-01T00:00:00.000Z");
    expect(performance.now() - t).toBeLessThan(100);
    expect(list).toHaveLength(365);
  });

  it("shows a broken rule once at its start, marked", () => {
    const s = ev("s", { rrule: "FREQ=SOMETIMES" });
    const list = occurrences([s], "2026-10-01T00:00:00.000Z", "2026-11-01T00:00:00.000Z");
    expect(list.map((o) => [o.start, o.broken])).toEqual([["2026-10-19T09:00:00.000Z", true]]);
  });
});

describe("occurrences: exceptions", () => {
  const series = ev("s", { rrule: "FREQ=DAILY" });
  const from = "2026-10-19T00:00:00.000Z";
  const to = "2026-10-22T00:00:00.000Z";

  it("moves one occurrence", () => {
    const moved = exc("x", "s", "2026-10-20T09:00:00.000Z", {
      title: "moved",
      start_at: "2026-10-20T14:00:00.000Z",
      end_at: "2026-10-20T15:00:00.000Z",
    });
    const list = occurrences([series, moved], from, to);
    expect(list.map((o) => [o.key, o.start, o.title])).toEqual([
      ["s@2026-10-19T09:00:00.000Z", "2026-10-19T09:00:00.000Z", "s"],
      ["x", "2026-10-20T14:00:00.000Z", "moved"],
      ["s@2026-10-21T09:00:00.000Z", "2026-10-21T09:00:00.000Z", "s"],
    ]);
    expect(list[1]).toMatchObject({ eventId: "x", seriesId: "s", originalStart: "2026-10-20T09:00:00.000Z" });
  });

  it("removes a cancelled occurrence", () => {
    const gone = exc("x", "s", "2026-10-20T09:00:00.000Z", { cancelled: true });
    expect(starts(occurrences([series, gone], from, to))).toEqual([
      "2026-10-19T09:00:00.000Z",
      "2026-10-21T09:00:00.000Z",
    ]);
  });

  it("hides an exception whose series isn't there", () => {
    const orphan = exc("x", "s", "2026-10-20T09:00:00.000Z", { end_at: "2026-10-20T10:00:00.000Z" });
    expect(occurrences([orphan], from, to)).toEqual([]);
  });

  it("hides an exception that matches no occurrence", () => {
    const stray = exc("x", "s", "2026-10-20T09:30:00.000Z", { end_at: "2026-10-20T10:30:00.000Z" });
    expect(occurrences([series, stray], from, to).map((o) => o.eventId)).toEqual(["s", "s", "s"]);
  });

  it("shows an exception moved into the range from outside it", () => {
    const moved = exc("x", "s", "2026-10-25T10:00:00.000Z", {
      start_at: "2026-10-20T14:00:00.000Z",
      end_at: "2026-10-20T15:00:00.000Z",
    });
    expect(occurrences([series, moved], from, to).map((o) => o.eventId)).toEqual(["s", "s", "x", "s"]);
  });
});

describe("toRRule / fromRRule", () => {
  const forms: Repeat[] = [
    { freq: "daily", interval: 1, byDay: [], end: { kind: "never" } },
    { freq: "weekly", interval: 2, byDay: ["MO", "WE", "FR"], end: { kind: "never" } },
    { freq: "weekly", interval: 1, byDay: [], end: { kind: "count", count: 5 } },
    { freq: "monthly", interval: 1, byDay: [], end: { kind: "on", date: "2026-12-31" } },
    { freq: "yearly", interval: 3, byDay: [], end: { kind: "on", date: "2027-07-15" } },
  ];

  it("round-trips every form option", () => {
    for (const form of forms) expect(fromRRule(toRRule(form, TZ), TZ)).toEqual(form);
  });

  it("writes standard RRULE text", () => {
    expect(toRRule(forms[1], TZ)).toBe("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR");
    expect(toRRule(forms[2], TZ)).toBe("FREQ=WEEKLY;COUNT=5");
  });

  it("puts UNTIL at the end of the day in the zone, in UTC", () => {
    expect(toRRule({ ...forms[0], end: { kind: "on", date: "2026-07-15" } }, TZ)).toBe(
      "FREQ=DAILY;UNTIL=20260715T225959Z",
    );
    expect(toRRule({ ...forms[0], end: { kind: "on", date: "2026-12-15" } }, TZ)).toBe(
      "FREQ=DAILY;UNTIL=20261215T235959Z",
    );
  });

  it("writes null for none, and reads null as none", () => {
    expect(toRRule({ ...forms[0], freq: "none" }, TZ)).toBeNull();
    expect(fromRRule(null, TZ)).toEqual({ freq: "none", interval: 1, byDay: [], end: { kind: "never" } });
  });

  it("reads weekly without BYDAY as empty byDay", () => {
    expect(fromRRule("FREQ=WEEKLY", TZ)).toEqual({ freq: "weekly", interval: 1, byDay: [], end: { kind: "never" } });
  });

  it("returns null for rules the form can't show", () => {
    expect(fromRRule("FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1", TZ)).toBeNull();
    expect(fromRRule("FREQ=HOURLY", TZ)).toBeNull();
    expect(fromRRule("FREQ=WEEKLY;BYDAY=1MO", TZ)).toBeNull();
    expect(fromRRule("not a rule", TZ)).toBeNull();
  });
});

describe("validTimes", () => {
  it("needs end after start", () => {
    expect(validTimes("2026-10-19T09:00:00.000Z", "2026-10-19T09:30:00.000Z")).toBe(true);
    expect(validTimes("2026-10-19T09:00:00.000Z", "2026-10-19T09:00:00.000Z")).toBe(false);
    expect(validTimes("2026-10-19T09:00:00.000Z", "2026-10-19T08:00:00.000Z")).toBe(false);
  });

  it("needs valid dates", () => {
    expect(validTimes("nope", "2026-10-19T09:00:00.000Z")).toBe(false);
    expect(validTimes("2026-10-19T09:00:00.000Z", "")).toBe(false);
  });
});

describe("newEvent", () => {
  it("lasts 30 minutes by default", () => {
    const e = newEvent("n", "2026-10-19T09:00:00.000Z", null, false, TZ, NOW);
    expect(e).toEqual({
      id: "n",
      title: "",
      notes: "",
      all_day: false,
      start_at: "2026-10-19T09:00:00.000Z",
      end_at: "2026-10-19T09:30:00.000Z",
      time_zone: TZ,
      rrule: null,
      series_id: null,
      original_start: null,
      cancelled: false,
      show_as: "busy",
      created_at: NOW,
      updated_at: NOW,
    });
  });

  it("keeps a dragged end", () => {
    expect(newEvent("n", "2026-10-19T09:00:00.000Z", "2026-10-19T11:00:00.000Z", false, TZ, NOW).end_at).toBe(
      "2026-10-19T11:00:00.000Z",
    );
  });

  it("stores all-day as midnight in the zone", () => {
    const one = newEvent("n", "2026-10-19", null, true, TZ, NOW);
    expect([one.start_at, one.end_at]).toEqual(["2026-10-18T23:00:00.000Z", "2026-10-19T23:00:00.000Z"]);
    const across = newEvent("n", "2026-10-24", "2026-10-26", true, TZ, NOW);
    expect([across.start_at, across.end_at]).toEqual(["2026-10-23T23:00:00.000Z", "2026-10-26T00:00:00.000Z"]);
  });
});

describe("applyChange", () => {
  const series = ev("s", { rrule: "FREQ=DAILY" });
  const day2 = "2026-10-20T09:00:00.000Z";
  const day3 = "2026-10-21T09:00:00.000Z";

  it("changes a one-off directly", () => {
    const one = ev("a");
    const [o] = occurrences([one], T, "2026-11-01T00:00:00.000Z");
    expect(applyChange([one], o, "following", { title: "new" }, ctx())).toEqual({
      put: [{ ...one, title: "new", updated_at: NOW }],
      archive: [],
    });
  });

  it("only: writes a new exception", () => {
    const o = occOf([series], "s", day2);
    const w = applyChange([series], o, "only", { start_at: "2026-10-20T14:00:00.000Z", end_at: "2026-10-20T15:00:00.000Z" }, ctx());
    expect(w).toEqual({
      put: [
        {
          ...series,
          id: "new1",
          rrule: null,
          series_id: "s",
          original_start: day2,
          start_at: "2026-10-20T14:00:00.000Z",
          end_at: "2026-10-20T15:00:00.000Z",
          created_at: NOW,
          updated_at: NOW,
        },
      ],
      archive: [],
    });
  });

  it("only: updates the existing exception instead of adding one", () => {
    const x = exc("x", "s", day2, { title: "moved", start_at: "2026-10-20T14:00:00.000Z", end_at: "2026-10-20T15:00:00.000Z" });
    const o = occurrences([series, x], day2, "2026-10-21T00:00:00.000Z").find((oc) => oc.eventId === "x")!;
    expect(applyChange([series, x], o, "only", { title: "again" }, ctx())).toEqual({
      put: [{ ...x, title: "again", updated_at: NOW }],
      archive: [],
    });
  });

  it("following: ends the old series before and starts a new one", () => {
    const later = exc("late", "s", "2026-10-22T09:00:00.000Z");
    const earlier = exc("early", "s", "2026-10-19T09:00:00.000Z");
    const events = [series, later, earlier];
    const w = applyChange(events, occOf(events, "s", day3), "following", { title: "renamed" }, ctx());
    expect(w.put).toEqual([
      { ...series, rrule: "FREQ=DAILY;UNTIL=20261021T085959Z", updated_at: NOW },
      { ...series, id: "new1", title: "renamed", start_at: day3, end_at: "2026-10-21T10:00:00.000Z", created_at: NOW, updated_at: NOW },
    ]);
    expect(w.archive).toEqual(["late"]);
  });

  it("following: archives the exception it was started from", () => {
    const x = exc("x", "s", day3, { start_at: "2026-10-21T14:00:00.000Z", end_at: "2026-10-21T15:00:00.000Z" });
    const o = occurrences([series, x], day3, "2026-10-22T00:00:00.000Z").find((oc) => oc.eventId === "x")!;
    expect(applyChange([series, x], o, "following", { title: "t" }, ctx()).archive).toEqual(["x"]);
  });

  it("following: shares a COUNT between the two series", () => {
    const counted = ev("s", { rrule: "FREQ=DAILY;COUNT=5" });
    const w = applyChange([counted], occOf([counted], "s", day3), "following", { title: "t" }, ctx());
    expect(w.put.map((r) => r.rrule)).toEqual(["FREQ=DAILY;COUNT=2", "FREQ=DAILY;COUNT=3"]);
    const after = occurrences(w.put, T, "2026-12-01T00:00:00.000Z");
    expect(after.map((o) => [o.eventId, o.start.slice(0, 10)])).toEqual([
      ["s", "2026-10-19"],
      ["s", "2026-10-20"],
      ["new1", "2026-10-21"],
      ["new1", "2026-10-22"],
      ["new1", "2026-10-23"],
    ]);
  });

  it("following on the first occurrence acts like all", () => {
    const first = occOf([series], "s", "2026-10-19T09:00:00.000Z");
    expect(applyChange([series], first, "following", { title: "t" }, ctx())).toEqual(
      applyChange([series], first, "all", { title: "t" }, ctx()),
    );
  });

  it("all: moving the time shifts the series and archives exceptions", () => {
    const x = exc("x", "s", day2, { title: "kept?" });
    const events = [series, x];
    const w = applyChange(
      events,
      occOf(events, "s", day3),
      "all",
      { start_at: "2026-10-21T11:00:00.000Z", end_at: "2026-10-21T12:30:00.000Z" },
      ctx(),
    );
    expect(w).toEqual({
      put: [{ ...series, start_at: "2026-10-19T11:00:00.000Z", end_at: "2026-10-19T12:30:00.000Z", updated_at: NOW }],
      archive: ["x"],
    });
  });

  it("all: a move after the clock change keeps the wall-clock shift", () => {
    // Series at 10:00 Lisbon from 19 Oct; the 26 Oct occurrence (10:00 = 10:00Z) is moved to 11:00 local.
    const weekly = ev("s", { rrule: "FREQ=WEEKLY" });
    const o = occOf([weekly], "s", "2026-10-26T10:00:00.000Z");
    const w = applyChange([weekly], o, "all", { start_at: "2026-10-26T11:00:00.000Z", end_at: "2026-10-26T12:00:00.000Z" }, ctx());
    expect([w.put[0].start_at, w.put[0].end_at]).toEqual(["2026-10-19T10:00:00.000Z", "2026-10-19T11:00:00.000Z"]);
  });

  it("all: changing only the title keeps exceptions", () => {
    const x = exc("x", "s", day2);
    const w = applyChange([series, x], occOf([series, x], "s", day3), "all", { title: "renamed" }, ctx());
    expect(w).toEqual({ put: [{ ...series, title: "renamed", updated_at: NOW }], archive: [] });
  });

  it("all: changing the rule archives exceptions", () => {
    const x = exc("x", "s", day2);
    const w = applyChange([series, x], occOf([series, x], "s", day3), "all", { rrule: "FREQ=WEEKLY" }, ctx());
    expect(w.archive).toEqual(["x"]);
    expect(w.put[0].rrule).toBe("FREQ=WEEKLY");
  });

  it("all: from an exception changes the series", () => {
    const x = exc("x", "s", day2, { start_at: "2026-10-20T14:00:00.000Z", end_at: "2026-10-20T15:00:00.000Z" });
    const o = occurrences([series, x], day2, "2026-10-21T00:00:00.000Z").find((oc) => oc.eventId === "x")!;
    expect(applyChange([series, x], o, "all", { title: "renamed" }, ctx())).toEqual({
      put: [{ ...series, title: "renamed", updated_at: NOW }],
      archive: [],
    });
  });
});

describe("archiveOccurrence", () => {
  const series = ev("s", { rrule: "FREQ=DAILY" });
  const day2 = "2026-10-20T09:00:00.000Z";
  const day3 = "2026-10-21T09:00:00.000Z";

  it("archives a one-off", () => {
    const one = ev("a");
    const [o] = occurrences([one], T, "2026-11-01T00:00:00.000Z");
    expect(archiveOccurrence([one], o, "only", ctx())).toEqual({ put: [], archive: ["a"] });
  });

  it("only: writes a cancelled exception", () => {
    const w = archiveOccurrence([series], occOf([series], "s", day2), "only", ctx());
    expect(w.archive).toEqual([]);
    expect(w.put).toEqual([
      {
        ...series,
        id: "new1",
        rrule: null,
        series_id: "s",
        original_start: day2,
        cancelled: true,
        start_at: day2,
        end_at: "2026-10-20T10:00:00.000Z",
        created_at: NOW,
        updated_at: NOW,
      },
    ]);
    expect(starts(occurrences([series, ...w.put], day2, "2026-10-21T00:00:00.000Z"))).toEqual([]);
  });

  it("only: cancels an existing exception instead of adding one", () => {
    const x = exc("x", "s", day2, { title: "moved" });
    const w = archiveOccurrence([series, x], occOf([series], "s", day2), "only", ctx());
    expect(w).toEqual({ put: [{ ...x, cancelled: true, updated_at: NOW }], archive: [] });
  });

  it("following: ends the series and archives later exceptions", () => {
    const later = exc("late", "s", "2026-10-22T09:00:00.000Z");
    const earlier = exc("early", "s", "2026-10-19T09:00:00.000Z");
    const events = [series, later, earlier];
    expect(archiveOccurrence(events, occOf(events, "s", day3), "following", ctx())).toEqual({
      put: [{ ...series, rrule: "FREQ=DAILY;UNTIL=20261021T085959Z", updated_at: NOW }],
      archive: ["late"],
    });
  });

  it("following: cuts a COUNT", () => {
    const counted = ev("s", { rrule: "FREQ=DAILY;COUNT=5" });
    const w = archiveOccurrence([counted], occOf([counted], "s", day3), "following", ctx());
    expect(w.put[0].rrule).toBe("FREQ=DAILY;COUNT=2");
  });

  it("following on the first occurrence acts like all", () => {
    const first = occOf([series], "s", "2026-10-19T09:00:00.000Z");
    expect(archiveOccurrence([series], first, "following", ctx())).toEqual({ put: [], archive: ["s"] });
  });

  it("all: archives the series", () => {
    expect(archiveOccurrence([series], occOf([series], "s", day3), "all", ctx())).toEqual({ put: [], archive: ["s"] });
  });
});
