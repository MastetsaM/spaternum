// What the calendar screen needs besides the rules in calendar.ts: the view kept per device, the days that get a dot in the year view, the form's inputs ↔ stored times, and
// finding an occurrence again by its key. Spec: calendar_spec.

import { Temporal } from "temporal-polyfill";
import {
  occurrences,
  toRRule,
  type CalendarEvent,
  type Change,
  type Occurrence,
  type Repeat,
  type Scope,
  type ShowAs,
  type Weekday,
  type Writes,
} from "./calendar";

/** Monday first, like the calendar. */
export const WEEKDAYS: Weekday[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

// ---- View, per device ----

export const VIEWS = [
  { id: "multiMonthYear", label: "Year" },
  { id: "dayGridMonth", label: "Month" },
  { id: "timeGridWeek", label: "Week" },
  { id: "timeGridDay", label: "Day" },
] as const;
export type ViewId = (typeof VIEWS)[number]["id"];
export type Prefs = { view: ViewId };

/** Every day is split into 30-minute slots (Mihail, 2026-10-30: no switch). */
export const SLOT_MINUTES = 30;

const PREFS_KEY = "spaternum.calendar";
export const DEFAULT_PREFS: Prefs = { view: "timeGridWeek" };

/** The saved view; anything missing or unknown falls back to week. */
export function parsePrefs(value: string | null): Prefs {
  let saved: unknown;
  try {
    saved = JSON.parse(value ?? "null");
  } catch {
    return DEFAULT_PREFS;
  }
  const { view } = (saved ?? {}) as Partial<Record<keyof Prefs, unknown>>;
  return { view: VIEWS.some((v) => v.id === view) ? (view as ViewId) : DEFAULT_PREFS.view };
}

export function loadPrefs(): Prefs {
  try {
    return parsePrefs(localStorage.getItem(PREFS_KEY));
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // not saved: the calendar opens on the default view next time
  }
}

// ---- Dates ----

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" of a moment, in the device's time. */
export function localDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "YYYY-MM-DD" n days later (or earlier). */
export function addDays(day: string, n: number): string {
  return Temporal.PlainDate.from(day).add({ days: n }).toString();
}

/** Midnight at the start of a "YYYY-MM-DD" day in a time zone, as toISOString(). */
export function midnight(day: string, timeZone: string): string {
  return new Date(Temporal.PlainDate.from(day).toZonedDateTime(timeZone).epochMilliseconds).toISOString();
}

/** An ISO moment → "YYYY-MM-DDTHH:mm" in the device's time, for <input type="datetime-local">. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  return `${localDay(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const MINUTE = 60_000;

/** Every day an occurrence touches, in the device's time: the year view puts a dot on them. */
export function daysWithEvents(list: Occurrence[]): Set<string> {
  const days = new Set<string>();
  for (const o of list) {
    const first = o.allDay ? o.start : localDay(new Date(o.start));
    // Ends are exclusive: an all-day end is the day after, a timed event ending at midnight
    // doesn't touch the next day
    const end = o.allDay ? addDays(o.end, -1) : localDay(new Date(Date.parse(o.end) - 1));
    const last = end > first ? end : first;
    let day = first;
    for (let i = 0; i < 400 && day <= last; i++) {
      days.add(day);
      day = addDays(day, 1);
    }
  }
  return days;
}

// ---- Creating and dragging on the calendar ----

/**
 * What newEvent() gets from a tap or a drag across slots. A tap (one slot, or one day) leaves
 * the end out, so the event gets the default length (30 minutes, or one day).
 */
export function fromSelection(start: Date, end: Date, allDay: boolean): { start: string; end: string | null } {
  if (allDay) {
    const first = localDay(start);
    const after = localDay(end);
    return { start: first, end: after === addDays(first, 1) ? null : after };
  }
  return { start: start.toISOString(), end: end.getTime() - start.getTime() > SLOT_MINUTES * MINUTE ? end.toISOString() : null };
}

/** The stored times after a move or resize. An all-day event dropped without an end lasts one day. */
export function droppedTimes(start: Date, end: Date | null, allDay: boolean, timeZone: string): { start_at: string; end_at: string } {
  if (allDay) {
    const first = localDay(start);
    return { start_at: midnight(first, timeZone), end_at: midnight(end ? localDay(end) : addDays(first, 1), timeZone) };
  }
  return { start_at: start.toISOString(), end_at: (end ?? new Date(start.getTime() + 30 * MINUTE)).toISOString() };
}

// ---- The event form ----

/**
 * What the form shows. start/end: "YYYY-MM-DDTHH:mm" in the device's time, or for all-day
 * "YYYY-MM-DD" with the end day included. repeat null = a rule the form can't show; it's kept.
 */
export type FormValues = {
  title: string;
  notes: string;
  allDay: boolean;
  start: string;
  end: string;
  showAs: ShowAs;
  repeat: Repeat | null;
};

/** The form's start/end time list: every 30 minutes, plus `current` if it's another minute (e.g. 10:15 synced from elsewhere). */
export function timeChoices(current: string): string[] {
  const times: string[] = [];
  for (let m = 0; m < 24 * 60; m += SLOT_MINUTES) times.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  if (/^\d{2}:\d{2}$/.test(current) && !times.includes(current)) times.push(current);
  return times.sort();
}

/** The form's start and end for an occurrence. */
export function inputTimes(o: Pick<Occurrence, "allDay" | "start" | "end">): { start: string; end: string } {
  if (o.allDay) return { start: o.start, end: o.end > o.start ? addDays(o.end, -1) : o.start };
  return { start: toLocalInput(o.start), end: toLocalInput(o.end) };
}

/** A new start moves the end with it, so the length stays (unless the old times were invalid). */
export function moveStart(values: FormValues, start: string): FormValues {
  if (values.allDay) {
    const valid = /^\d{4}-\d{2}-\d{2}$/;
    if (!valid.test(start) || !valid.test(values.start) || !valid.test(values.end)) return { ...values, start };
    const days = Temporal.PlainDate.from(values.start).until(values.end).days;
    return { ...values, start, end: addDays(start, days) };
  }
  const length = Date.parse(values.end) - Date.parse(values.start);
  const moved = Date.parse(start) + length;
  return { ...values, start, end: isNaN(moved) ? values.end : toLocalInput(new Date(moved).toISOString()) };
}

/** The weekday of a "YYYY-MM-DD" day, as the repeat form names it. */
export function weekdayOf(day: string): Weekday {
  return WEEKDAYS[Temporal.PlainDate.from(day).dayOfWeek - 1];
}

/** All-day on keeps the days; off puts the event at 09:00–09:30 on its first day. */
export function switchAllDay(values: FormValues, allDay: boolean): FormValues {
  if (allDay === values.allDay) return values;
  if (allDay) {
    const start = values.start.slice(0, 10);
    const end = values.end.slice(0, 10);
    return { ...values, allDay, start, end: end > start ? end : start };
  }
  const day = values.start.slice(0, 10);
  return { ...values, allDay, start: `${day}T09:00`, end: `${day}T09:30` };
}

/** The form's times as stored: ISO moments; all-day = midnights in the event's time zone, end exclusive. */
export function storedTimes(values: FormValues, timeZone: string): { start_at: string; end_at: string } {
  if (values.allDay) {
    return { start_at: midnight(values.start, timeZone), end_at: midnight(addDays(values.end, 1), timeZone) };
  }
  const iso = (input: string) => {
    const d = new Date(input); // no zone in the text = the device's time
    return isNaN(d.getTime()) ? "" : d.toISOString();
  };
  return { start_at: iso(values.start), end_at: iso(values.end) };
}

/** Only what differs from the last save. A changed time always sends both start and end. */
export function formChange(values: FormValues, saved: FormValues, timeZone: string): Change {
  const change: Change = {};
  if (values.title !== saved.title) change.title = values.title;
  if (values.notes !== saved.notes) change.notes = values.notes;
  if (values.allDay !== saved.allDay) change.all_day = values.allDay;
  if (values.showAs !== saved.showAs) change.show_as = values.showAs;
  if (values.allDay !== saved.allDay || values.start !== saved.start || values.end !== saved.end) {
    Object.assign(change, storedTimes(values, timeZone));
  }
  if (values.repeat && JSON.stringify(values.repeat) !== JSON.stringify(saved.repeat)) {
    change.rrule = toRRule(values.repeat, timeZone);
  }
  return change;
}

// ---- Finding an occurrence again ----

/** The rows after the writes, as the database will have them. */
export function applyWrites(rows: CalendarEvent[], { put, archive }: Writes): CalendarEvent[] {
  const changed = new Map(put.map((r) => [r.id, r]));
  const gone = new Set(archive);
  const kept = rows.filter((r) => !gone.has(r.id) && !changed.has(r.id));
  return [...kept, ...put.filter((r) => !gone.has(r.id))];
}

const after = (iso: string, ms: number) => new Date(Date.parse(iso) + ms).toISOString();

/** The first occurrence of a series (or the only one of a row) that covers the moment `at`. */
function occurrenceAt(rows: CalendarEvent[], at: string, pick: (o: Occurrence) => boolean): Occurrence | null {
  return occurrences(rows, at, after(at, 1)).find(pick) ?? null;
}

/**
 * The occurrence a key points at (keys are in the form's URL). A plain occurrence that has
 * since become an exception is still found, through its series and original start; a row id
 * also finds the row's first occurrence (a one-off that was just made to repeat).
 */
export function findOccurrence(rows: CalendarEvent[], key: string): Occurrence | null {
  const at = key.indexOf("@");
  if (at < 0) {
    const row = rows.find((r) => r.id === key);
    return row ? occurrenceAt(rows, row.start_at, (o) => o.key === key || o.eventId === key) : null;
  }
  const seriesId = key.slice(0, at);
  const originalStart = key.slice(at + 1);
  const exception = rows.find((r) => r.series_id === seriesId && r.original_start === originalStart);
  if (exception) return findOccurrence(rows, exception.id);
  return occurrenceAt(rows, originalStart, (o) => o.key === key);
}

/**
 * The occurrence the form edits after a save, so the next save builds on what's stored now.
 * - one-off: the same row; "only": its exception; "following": the new series' first
 *   occurrence (on the first occurrence "following" = "all");
 * - "all": the series' occurrence now at the form's start (or the one-off it became, with no repeat).
 * `rows` are the rows after the writes. null = it can't be found any more.
 */
export function nextOccurrence(
  rows: CalendarEvent[],
  occurrence: Occurrence,
  scope: Scope,
  writes: Writes,
  startAt: string,
): Occurrence | null {
  const { seriesId, originalStart } = occurrence;
  if (!seriesId) return findOccurrence(rows, occurrence.key);
  if (scope === "only") {
    const exception = writes.put.find((r) => r.series_id === seriesId && r.original_start === originalStart);
    return exception ? findOccurrence(rows, exception.id) : null;
  }
  if (scope === "following") {
    const series = writes.put.find((r) => r.rrule && !r.series_id && r.id !== seriesId);
    if (series) return occurrenceAt(rows, series.start_at, (o) => o.seriesId === series.id);
  }
  return occurrenceAt(rows, startAt, (o) => o.seriesId === seriesId || o.eventId === seriesId);
}
