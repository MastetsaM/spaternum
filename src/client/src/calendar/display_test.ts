// Dates are built from local parts, so these pass in any time zone.

import { describe, expect, it } from "vitest";
import { applyChange, newEvent, type CalendarEvent, type Occurrence } from "./calendar";
import {
  addDays,
  applyWrites,
  daysWithEvents,
  DEFAULT_PREFS,
  droppedTimes,
  findOccurrence,
  formChange,
  fromSelection,
  inputTimes,
  midnight,
  moveStart,
  nextOccurrence,
  parsePrefs,
  shortTitle,
  storedTimes,
  switchAllDay,
  timeChoices,
  toLocalInput,
  weekdayOf,
  type FormValues,
} from "./display";

const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);
const iso = (y: number, m: number, d: number, h = 0, min = 0) => local(y, m, d, h, min).toISOString();

const occ = (over: Partial<Occurrence>): Occurrence => ({
  key: "a",
  eventId: "a",
  seriesId: null,
  originalStart: null,
  title: "",
  allDay: false,
  start: iso(2026, 10, 29, 10),
  end: iso(2026, 10, 29, 11),
  showAs: "busy",
  broken: false,
  ...over,
});

const values = (over: Partial<FormValues>): FormValues => ({
  title: "Call",
  notes: "",
  allDay: false,
  start: "2026-10-29T10:00",
  end: "2026-10-29T10:30",
  showAs: "busy",
  repeat: { freq: "none", interval: 1, byDay: [], end: { kind: "never" } },
  ...over,
});

describe("saved view", () => {
  it("falls back to week and 30 minutes when missing or broken", () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("not json")).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('{"view":"listWeek"}')).toEqual({ view: "timeGridWeek" });
  });

  it("keeps a known view", () => {
    expect(parsePrefs('{"view":"multiMonthYear","slot":15}')).toEqual({ view: "multiMonthYear" }); // an old saved slot size is ignored
  });
});

describe("short title on the phone", () => {
  const d = (year: number, month: number, day: number) => ({ year, month, day });
  it("writes DD MMM YY", () => {
    expect(shortTitle("timeGridDay", d(2026, 10, 27))).toBe("27 Oct 26");
    expect(shortTitle("timeGridDay", d(2026, 11, 3))).toBe("03 Nov 26");
    expect(shortTitle("dayGridMonth", d(2026, 10, 1))).toBe("Oct 26");
    expect(shortTitle("multiMonthYear", d(2026, 1, 1))).toBe("2026");
  });
  it("shows a week's first and last day", () => {
    expect(shortTitle("timeGridWeek", d(2026, 10, 19))).toBe("19 – 25 Oct 26");
    expect(shortTitle("timeGridWeek", d(2026, 10, 26))).toBe("26 Oct – 01 Nov 26");
    expect(shortTitle("timeGridWeek", d(2026, 12, 28))).toBe("28 Dec 26 – 03 Jan 27");
  });
});

describe("dates", () => {
  it("adds days across month ends and summer time", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-03-29", -1)).toBe("2026-03-28");
  });

  it("finds midnight in the event's time zone", () => {
    expect(midnight("2026-07-01", "Europe/Lisbon")).toBe("2026-06-30T23:00:00.000Z"); // summer time
    expect(midnight("2026-12-01", "Europe/Lisbon")).toBe("2026-12-01T00:00:00.000Z");
  });

  it("writes a moment for a datetime-local box", () => {
    expect(toLocalInput(iso(2026, 3, 5, 8, 7))).toBe("2026-03-05T08:07");
  });
});

describe("days with a dot in the year view", () => {
  it("marks every day an event touches", () => {
    const days = daysWithEvents([
      occ({ start: iso(2026, 10, 29, 23), end: iso(2026, 10, 30, 1) }), // across midnight
      occ({ allDay: true, start: "2026-11-02", end: "2026-11-04" }), // two days, end exclusive
    ]);
    expect([...days].sort()).toEqual(["2026-10-29", "2026-10-30", "2026-11-02", "2026-11-03"]);
  });

  it("doesn't mark the next day for an event ending at midnight", () => {
    expect([...daysWithEvents([occ({ start: iso(2026, 10, 29, 22), end: iso(2026, 10, 30) })])]).toEqual(["2026-10-29"]);
  });
});

describe("creating from the calendar", () => {
  it("gives a tap the default length, a drag its own", () => {
    const start = local(2026, 10, 29, 10);
    expect(fromSelection(start, local(2026, 10, 29, 10, 30), false)).toEqual({ start: start.toISOString(), end: null });
    expect(fromSelection(start, local(2026, 10, 29, 11), false).end).toBe(iso(2026, 10, 29, 11));
  });

  it("uses days for all-day", () => {
    expect(fromSelection(local(2026, 10, 29), local(2026, 10, 30), true)).toEqual({ start: "2026-10-29", end: null });
    expect(fromSelection(local(2026, 10, 29), local(2026, 11, 1), true)).toEqual({ start: "2026-10-29", end: "2026-11-01" });
  });
});

describe("dragging", () => {
  it("stores timed moves as they are", () => {
    expect(droppedTimes(local(2026, 10, 29, 9), local(2026, 10, 29, 10), false, "Europe/Lisbon")).toEqual({
      start_at: iso(2026, 10, 29, 9),
      end_at: iso(2026, 10, 29, 10),
    });
  });

  it("stores all-day days as midnights in the event's zone; no end = one day", () => {
    expect(droppedTimes(local(2026, 7, 1), null, true, "Europe/Lisbon")).toEqual({
      start_at: "2026-06-30T23:00:00.000Z",
      end_at: "2026-07-01T23:00:00.000Z",
    });
  });
});

describe("the event form", () => {
  it("shows all-day ends as the last day", () => {
    expect(inputTimes(occ({ allDay: true, start: "2026-11-02", end: "2026-11-04" }))).toEqual({
      start: "2026-11-02",
      end: "2026-11-03",
    });
    expect(inputTimes(occ({}))).toEqual({ start: "2026-10-29T10:00", end: "2026-10-29T11:00" });
  });

  it("switches all-day on and off", () => {
    const on = switchAllDay(values({}), true);
    expect(on).toMatchObject({ allDay: true, start: "2026-10-29", end: "2026-10-29" });
    expect(switchAllDay(on, false)).toMatchObject({ allDay: false, start: "2026-10-29T09:00", end: "2026-10-29T09:30" });
  });

  it("keeps the length when the start moves", () => {
    expect(moveStart(values({}), "2026-10-30T14:00")).toMatchObject({ start: "2026-10-30T14:00", end: "2026-10-30T14:30" });
    const days = values({ allDay: true, start: "2026-10-29", end: "2026-10-31" });
    expect(moveStart(days, "2026-11-30")).toMatchObject({ start: "2026-11-30", end: "2026-12-02" });
    expect(moveStart(values({ end: "" }), "2026-10-30T14:00").end).toBe(""); // invalid before: end left alone
  });

  it("names the weekday of a day", () => {
    expect(weekdayOf("2026-10-26")).toBe("MO");
    expect(weekdayOf("2026-11-01")).toBe("SU");
  });

  it("stores the form's times", () => {
    expect(storedTimes(values({}), "Europe/Lisbon")).toEqual({
      start_at: iso(2026, 10, 29, 10),
      end_at: iso(2026, 10, 29, 10, 30),
    });
    expect(storedTimes(values({ allDay: true, start: "2026-12-01", end: "2026-12-02" }), "Europe/Lisbon")).toEqual({
      start_at: "2026-12-01T00:00:00.000Z",
      end_at: "2026-12-03T00:00:00.000Z",
    });
    expect(storedTimes(values({ end: "" }), "Europe/Lisbon").end_at).toBe("");
  });

  it("sends only what changed, and both times when one changes", () => {
    const saved = values({});
    expect(formChange(saved, saved, "Europe/Lisbon")).toEqual({});
    expect(formChange(values({ title: "Lunch" }), saved, "Europe/Lisbon")).toEqual({ title: "Lunch" });
    expect(formChange(values({ end: "2026-10-29T11:00" }), saved, "Europe/Lisbon")).toEqual({
      start_at: iso(2026, 10, 29, 10),
      end_at: iso(2026, 10, 29, 11),
    });
    expect(formChange(values({ showAs: "tentative" }), saved, "Europe/Lisbon")).toEqual({ show_as: "tentative" });
  });

  it("lists times every 30 minutes, keeping another minute that's already set", () => {
    const list = timeChoices("10:00");
    expect(list.length).toBe(48);
    expect([list[0], list[1], list[47]]).toEqual(["00:00", "00:30", "23:30"]);
    expect(timeChoices("10:15").slice(20, 23)).toEqual(["10:00", "10:15", "10:30"]);
    expect(timeChoices("").length).toBe(48);
  });
});

describe("applyWrites", () => {
  const row = (id: string, title = ""): CalendarEvent => ({
    id,
    title,
    notes: "",
    all_day: false,
    start_at: iso(2026, 10, 29, 10),
    end_at: iso(2026, 10, 29, 11),
    time_zone: "Europe/Lisbon",
    rrule: null,
    series_id: null,
    original_start: null,
    cancelled: false,
    show_as: "busy",
    created_at: "",
    updated_at: "",
  });

  it("replaces put rows, adds new ones and drops archived ones", () => {
    const after = applyWrites([row("a"), row("b"), row("c")], { put: [row("a", "new"), row("d")], archive: ["b"] });
    expect(after.map((r) => [r.id, r.title])).toEqual([["c", ""], ["a", "new"], ["d", ""]]);
  });
});

// ---- Finding the occurrence the form edits (with the real rules from calendar.ts) ----

describe("finding occurrences", () => {
  const T = "2026-10-01T00:00:00.000Z";
  let n = 0;
  const ctx = { now: "2026-10-29T12:00:00.000Z", newId: () => `id-${++n}` };
  const weekly: CalendarEvent = {
    ...newEvent("s", "2026-11-02T10:00:00.000Z", "2026-11-02T11:00:00.000Z", false, "UTC", T),
    title: "Standup",
    rrule: "FREQ=WEEKLY",
  };
  const second = "2026-11-09T10:00:00.000Z";

  it("finds a one-off by its id", () => {
    const one = newEvent("o", "2026-11-03T09:00:00.000Z", null, false, "UTC", T);
    expect(findOccurrence([one], "o")?.start).toBe("2026-11-03T09:00:00.000Z");
  });

  it("finds a plain occurrence by its series key", () => {
    expect(findOccurrence([weekly], `s@${second}`)?.start).toBe(second);
  });

  it("finds the exception that replaced a plain occurrence", () => {
    const occ = findOccurrence([weekly], `s@${second}`)!;
    const writes = applyChange([weekly], occ, "only", { title: "Moved" }, ctx);
    const rows = applyWrites([weekly], writes);
    expect(findOccurrence(rows, `s@${second}`)?.title).toBe("Moved");
  });

  it("an unknown key finds nothing", () => {
    expect(findOccurrence([weekly], "nope")).toBeNull();
    expect(findOccurrence([weekly], `s@2026-11-10T10:00:00.000Z`)).toBeNull();
  });

  it("after 'only', the form edits the exception", () => {
    const occ = findOccurrence([weekly], `s@${second}`)!;
    const writes = applyChange([weekly], occ, "only", { title: "Moved" }, ctx);
    const next = nextOccurrence(applyWrites([weekly], writes), occ, "only", writes, occ.start);
    expect(next?.eventId).toBe(writes.put[0].id);
  });

  it("after 'following', the form edits the new series' first occurrence", () => {
    const occ = findOccurrence([weekly], `s@${second}`)!;
    const writes = applyChange([weekly], occ, "following", { title: "New" }, ctx);
    const next = nextOccurrence(applyWrites([weekly], writes), occ, "following", writes, occ.start);
    expect(next?.title).toBe("New");
    expect(next?.seriesId).not.toBe("s");
    expect(next?.start).toBe(second);
  });

  it("after 'all' with a new time, the form edits the occurrence at the new start", () => {
    const occ = findOccurrence([weekly], `s@${second}`)!;
    const start = "2026-11-09T12:00:00.000Z";
    const change = { start_at: start, end_at: "2026-11-09T13:00:00.000Z" };
    const writes = applyChange([weekly], occ, "all", change, ctx);
    const next = nextOccurrence(applyWrites([weekly], writes), occ, "all", writes, start);
    expect(next?.seriesId).toBe("s");
    expect(next?.start).toBe(start);
  });
});
