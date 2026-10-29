// @ts-nocheck -- contract stubs; the logic agent removes this line when the bodies are built
// Calendar rules that don't need the database or the screen: which occurrences of each event
// fall in the dates on screen, the repeat form ↔ RRULE text, new events, and what each edit
// or archive writes for "only this one / this and following / all". Spec: calendar_spec.

/** One row of the calendar_events collection — same fields as the server's table. */
export type CalendarEvent = {
  id: string;
  title: string;
  notes: string;
  all_day: boolean;
  start_at: string; // toISOString(); for all-day: midnight in time_zone
  end_at: string; // after start_at; for all-day: midnight after the last day (exclusive)
  time_zone: string; // IANA name, e.g. "Europe/Lisbon"
  rrule: string | null; // set = a series, e.g. "FREQ=WEEKLY;BYDAY=MO" (no DTSTART line)
  series_id: string | null; // set = an exception of that series
  original_start: string | null; // set on an exception: the occurrence it replaces (toISOString())
  cancelled: boolean; // exception that removes its occurrence
  created_at: string;
  updated_at: string;
};

/** One thing drawn on the calendar. */
export type Occurrence = {
  key: string; // unique on screen: the row id, or `${seriesId}@${originalStart}` for a plain occurrence
  eventId: string; // the row this came from: the one-off, the series, or the exception
  seriesId: string | null; // set when it belongs to a series (plain occurrence or exception)
  originalStart: string | null; // set when it belongs to a series: which occurrence it is (toISOString())
  title: string;
  allDay: boolean;
  start: string; // toISOString(); for all-day: "YYYY-MM-DD" in the event's time zone
  end: string; // same format as start; all-day end is exclusive
  broken: boolean; // the series' rule couldn't be read: shown once at its start, with a mark
};

/**
 * Every occurrence that overlaps [from, to) (toISOString() bounds), sorted by start.
 * - One-offs as they are. Rows with series_id are never shown on their own.
 * - A series is expanded in its own time_zone, so 10:00 stays 10:00 across summer time;
 *   each occurrence lasts end_at − start_at.
 * - An exception replaces the occurrence whose start equals its original_start; a cancelled
 *   one removes it. An exception with no matching occurrence, or whose series isn't in
 *   `events`, isn't shown.
 * - A rule that can't be read: the series shows once at start_at with broken: true.
 */
export function occurrences(events: CalendarEvent[], from: string, to: string): Occurrence[] {
  throw new Error("not built yet");
}

export type Weekday = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";

/** What the repeat part of the event form shows and edits. */
export type Repeat = {
  freq: "none" | "daily" | "weekly" | "monthly" | "yearly"; // monthly = same date, yearly = same day
  interval: number; // every N days/weeks/…, 1 or more
  byDay: Weekday[]; // weekly only; empty = the start's weekday
  end: { kind: "never" } | { kind: "on"; date: string } | { kind: "count"; count: number }; // date: "YYYY-MM-DD", inclusive
};

/** RRULE text for the form's values; null for "none". UNTIL is the end of `end.date` in timeZone, in UTC. */
export function toRRule(repeat: Repeat, timeZone: string): string | null {
  throw new Error("not built yet");
}

/** The form's values for a stored rule. null rule → freq "none". A rule the form can't show (e.g. BYSETPOS) → null, and the form leaves it as is. */
export function fromRRule(rrule: string | null, timeZone: string): Repeat | null {
  throw new Error("not built yet");
}

/** End after start, and both valid dates. The form refuses anything else. */
export function validTimes(start: string, end: string): boolean {
  throw new Error("not built yet");
}

/**
 * A new one-off event from a tap or a drag on the calendar. `end` missing = start + 30 minutes
 * (or the next day for all-day). For all-day, `start`/`end` are "YYYY-MM-DD" and are stored as
 * midnight in timeZone. Title empty; created_at = updated_at = now.
 */
export function newEvent(
  id: string,
  start: string,
  end: string | null,
  allDay: boolean,
  timeZone: string,
  now: string,
): CalendarEvent {
  throw new Error("not built yet");
}

/** Which part of a series an edit or archive applies to. Ignored for one-offs. */
export type Scope = "only" | "following" | "all";

/** What the form or a drag changes. start_at/end_at are the occurrence's new times. */
export type Change = Partial<Pick<CalendarEvent, "title" | "notes" | "all_day" | "start_at" | "end_at" | "rrule">>;

/** What to write to the database: rows to insert or replace, and ids to archive. */
export type Writes = { put: CalendarEvent[]; archive: string[] };

/** Fresh ids and the corrected clock, passed in so the rules stay pure and testable. */
export type Ctx = { now: string; newId: () => string };

/**
 * What a change to one occurrence writes. Every put row gets updated_at = ctx.now.
 * - One-off (or scope ignored): the row with the change.
 * - "only": the occurrence's exception, created (series_id, original_start, the series' other
 *   fields) or updated.
 * - "following": the series ends just before this occurrence (UNTIL; a COUNT is cut to what's
 *   left before it) and a new series starts at this occurrence with the change and the rest of
 *   the rule. Exceptions from this occurrence on are archived. On the first occurrence = "all".
 * - "all": the series row changes; a new start/end moves every occurrence by the same amount.
 *   If the time or the rule changes, the series' exceptions are archived.
 * `events` = the rows on the device.
 */
export function applyChange(
  events: CalendarEvent[],
  occurrence: Occurrence,
  scope: Scope,
  change: Change,
  ctx: Ctx,
): Writes {
  throw new Error("not built yet");
}

/**
 * What archiving one occurrence writes.
 * - One-off: archive it.
 * - "only": a cancelled exception (an existing exception is updated to cancelled).
 * - "following": the series ends just before this occurrence; exceptions from it on are
 *   archived. On the first occurrence = "all".
 * - "all": archive the series (the server archives its exceptions with it).
 */
export function archiveOccurrence(
  events: CalendarEvent[],
  occurrence: Occurrence,
  scope: Scope,
  ctx: Ctx,
): Writes {
  throw new Error("not built yet");
}
