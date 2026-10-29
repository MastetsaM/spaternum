// Calendar rules that don't need the database or the screen: which occurrences of each event
// fall in the dates on screen, the repeat form ↔ RRULE text, new events, and what each edit
// or archive writes for "only this one / this and following / all". Spec: calendar_spec.

import { RRuleTemporal } from "rrule-temporal";
import { Temporal } from "temporal-polyfill";

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
  const fromMs = ms(from);
  const toMs = ms(to);
  // A zero-length event counts when its start is inside the range.
  const overlaps = (s: number, e: number) => s < toMs && (e > fromMs || (e <= s && s >= fromMs));

  // Exceptions by series, latest edit first (two devices may each have made one offline).
  const exceptionsOf = new Map<string, CalendarEvent[]>();
  for (const row of events) {
    if (row.series_id) exceptionsOf.set(row.series_id, [...(exceptionsOf.get(row.series_id) ?? []), row]);
  }

  const out: Drawn[] = [];
  for (const row of events) {
    if (row.series_id) continue;
    const start = ms(row.start_at);
    if (!row.rrule) {
      const end = ms(row.end_at);
      if (overlaps(start, end)) out.push(draw(row, row.id, null, null, start, end, false));
      continue;
    }

    let rule: RRuleTemporal;
    let starts: number[];
    try {
      rule = ruleOf(row);
      // Occurrences that started before `from` can still reach into it.
      const reach = maxLength(row);
      starts = rule.between(new Date(fromMs - reach), new Date(toMs), true).map((z) => z.epochMilliseconds);
    } catch {
      const end = ms(row.end_at);
      if (overlaps(start, end)) out.push(draw(row, `${row.id}@${iso(start)}`, row.id, iso(start), start, end, true));
      continue;
    }

    const replaced = new Set<number>();
    const own = [...(exceptionsOf.get(row.id) ?? [])].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    for (const exception of own) {
      const original = ms(exception.original_start ?? "");
      if (replaced.has(original) || !isOccurrence(rule, original)) continue;
      replaced.add(original);
      const s = ms(exception.start_at);
      const e = ms(exception.end_at);
      if (!exception.cancelled && overlaps(s, e)) {
        out.push(draw(exception, exception.id, row.id, iso(original), s, e, false));
      }
    }
    for (const s of starts) {
      const e = endFor(row, s);
      if (!replaced.has(s) && overlaps(s, e)) out.push(draw(row, `${row.id}@${iso(s)}`, row.id, iso(s), s, e, false));
    }
  }
  return out.sort((a, b) => a.sort - b.sort || a.occ.key.localeCompare(b.occ.key)).map((d) => d.occ);
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
  if (repeat.freq === "none") return null;
  const parts = [`FREQ=${repeat.freq.toUpperCase()}`];
  if (repeat.interval > 1) parts.push(`INTERVAL=${repeat.interval}`);
  if (repeat.freq === "weekly" && repeat.byDay.length > 0) {
    parts.push(`BYDAY=${WEEKDAYS.filter((d) => repeat.byDay.includes(d)).join(",")}`);
  }
  if (repeat.end.kind === "on") {
    const nextMidnight = Temporal.PlainDate.from(repeat.end.date).add({ days: 1 }).toZonedDateTime(timeZone);
    parts.push(`UNTIL=${utcStamp(nextMidnight.epochMilliseconds - 1000)}`);
  }
  if (repeat.end.kind === "count") parts.push(`COUNT=${repeat.end.count}`);
  return parts.join(";");
}

/** The form's values for a stored rule. null rule → freq "none". A rule the form can't show (e.g. BYSETPOS) → null, and the form leaves it as is. */
export function fromRRule(rrule: string | null, timeZone: string): Repeat | null {
  if (rrule === null) return { freq: "none", interval: 1, byDay: [], end: { kind: "never" } };
  const parts = new Map<string, string>();
  for (const part of rrule.split(";")) {
    const [key, value, ...extra] = part.split("=");
    if (!key || value === undefined || extra.length > 0 || parts.has(key)) return null;
    parts.set(key, value);
  }
  if ([...parts.keys()].some((key) => !["FREQ", "INTERVAL", "BYDAY", "UNTIL", "COUNT"].includes(key))) return null;

  const freqs = new Map<string, Repeat["freq"]>([
    ["DAILY", "daily"],
    ["WEEKLY", "weekly"],
    ["MONTHLY", "monthly"],
    ["YEARLY", "yearly"],
  ]);
  const freq = freqs.get(parts.get("FREQ") ?? "");
  if (!freq) return null;

  const interval = parts.has("INTERVAL") ? whole(parts.get("INTERVAL")!) : 1;
  if (interval === null) return null;

  const byDay = parts.has("BYDAY") ? parts.get("BYDAY")!.split(",") : [];
  if (byDay.length > 0 && (freq !== "weekly" || byDay.some((d) => !WEEKDAYS.includes(d as Weekday)))) return null;

  let end: Repeat["end"] = { kind: "never" };
  if (parts.has("UNTIL") && parts.has("COUNT")) return null;
  if (parts.has("COUNT")) {
    const count = whole(parts.get("COUNT")!);
    if (count === null) return null;
    end = { kind: "count", count };
  }
  if (parts.has("UNTIL")) {
    const date = untilDate(parts.get("UNTIL")!, timeZone);
    if (date === null) return null;
    end = { kind: "on", date };
  }
  return { freq, interval, byDay: WEEKDAYS.filter((d) => byDay.includes(d)), end };
}

/** End after start, and both valid dates. The form refuses anything else. */
export function validTimes(start: string, end: string): boolean {
  const s = Date.parse(start);
  const e = Date.parse(end);
  return !Number.isNaN(s) && !Number.isNaN(e) && e > s;
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
  let startMs: number;
  let endMs: number;
  if (allDay) {
    const first = Temporal.PlainDate.from(start);
    startMs = midnight(first, timeZone);
    endMs = midnight(end === null ? first.add({ days: 1 }) : Temporal.PlainDate.from(end), timeZone);
  } else {
    startMs = ms(start);
    endMs = end === null ? startMs + 30 * 60_000 : ms(end);
  }
  return {
    id,
    title: "",
    notes: "",
    all_day: allDay,
    start_at: iso(startMs),
    end_at: iso(endMs),
    time_zone: timeZone,
    rrule: null,
    series_id: null,
    original_start: null,
    cancelled: false,
    created_at: now,
    updated_at: now,
  };
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
  const stamp = (row: CalendarEvent): CalendarEvent => ({ ...row, updated_at: ctx.now });
  if (!occurrence.seriesId) {
    const row = events.find((e) => e.id === occurrence.eventId);
    return row ? { put: [stamp({ ...row, ...change })], archive: [] } : NOTHING;
  }
  const series = events.find((e) => e.id === occurrence.seriesId);
  if (!series) return NOTHING;
  const original = ms(occurrence.originalStart ?? "");
  const exceptions = events.filter((e) => e.series_id === series.id);
  if (scope === "following" && original <= ms(series.start_at)) scope = "all";

  if (scope === "only") {
    const { rrule: _rule, ...fields } = change; // an exception never repeats
    const row = exceptionFor(events, occurrence) ?? newException(series, occurrence, ctx);
    return { put: [stamp({ ...row, ...fields })], archive: [] };
  }

  if (scope === "following") {
    const { cut, rest } = split(series, original);
    const next: CalendarEvent = {
      ...series,
      id: ctx.newId(),
      rrule: rest,
      start_at: iso(original),
      end_at: iso(endFor(series, original)),
      created_at: ctx.now,
      ...change,
    };
    return {
      put: [stamp({ ...series, rrule: cut }), stamp(next)],
      archive: exceptions.filter((e) => ms(e.original_start ?? "") >= original).map((e) => e.id),
    };
  }

  // "all": the occurrence's new times, carried over to the series' first occurrence.
  let start_at = series.start_at;
  let end_at = series.end_at;
  if (change.start_at !== undefined || change.end_at !== undefined) {
    const tz = series.time_zone;
    const [currentStart, currentEnd] = occurrenceTimes(occurrence, tz);
    const newStart = zoned(change.start_at !== undefined ? ms(change.start_at) : currentStart, tz);
    const newEnd = zoned(change.end_at !== undefined ? ms(change.end_at) : currentEnd, tz);
    const first = zoned(ms(series.start_at), tz).add(zoned(original, tz).until(newStart, { largestUnit: "day" }));
    start_at = iso(first.epochMilliseconds);
    end_at = iso(first.add(newStart.until(newEnd, { largestUnit: "day" })).epochMilliseconds);
  }
  const timeChanged =
    ms(start_at) !== ms(series.start_at) ||
    ms(end_at) !== ms(series.end_at) ||
    (change.all_day !== undefined && change.all_day !== series.all_day);
  const ruleChanged = change.rrule !== undefined && change.rrule !== series.rrule;
  return {
    put: [stamp({ ...series, ...change, start_at, end_at })],
    archive: timeChanged || ruleChanged ? exceptions.map((e) => e.id) : [],
  };
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
  if (!occurrence.seriesId) return { put: [], archive: [occurrence.eventId] };
  const series = events.find((e) => e.id === occurrence.seriesId);
  if (!series) return NOTHING;
  const original = ms(occurrence.originalStart ?? "");
  if (scope === "following" && original <= ms(series.start_at)) scope = "all";

  if (scope === "only") {
    const row = exceptionFor(events, occurrence) ?? newException(series, occurrence, ctx);
    return { put: [{ ...row, cancelled: true, updated_at: ctx.now }], archive: [] };
  }
  if (scope === "following") {
    return {
      put: [{ ...series, rrule: split(series, original).cut, updated_at: ctx.now }],
      archive: events
        .filter((e) => e.series_id === series.id && ms(e.original_start ?? "") >= original)
        .map((e) => e.id),
    };
  }
  return { put: [], archive: [series.id] };
}

// ---- private helpers ----

const WEEKDAYS: Weekday[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const NOTHING: Writes = { put: [], archive: [] };
const HOUR = 3_600_000;

type Drawn = { sort: number; occ: Occurrence };

const ms = (text: string) => Date.parse(text);
const iso = (epochMs: number) => new Date(epochMs).toISOString();
const zoned = (epochMs: number, tz: string) => Temporal.Instant.fromEpochMilliseconds(epochMs).toZonedDateTimeISO(tz);
const dayOf = (epochMs: number, tz: string) => zoned(epochMs, tz).toPlainDate().toString();
const midnight = (date: Temporal.PlainDate, tz: string) => date.toZonedDateTime(tz).epochMilliseconds;

/** "20261025T235959Z" — the UTC form UNTIL takes. */
const utcStamp = (epochMs: number) => iso(epochMs).replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** A whole number of 1 or more, or null. */
function whole(text: string): number | null {
  return /^[1-9]\d*$/.test(text) ? Number(text) : null;
}

/** UNTIL's date in the zone: a UTC time is converted, a plain date or floating time is taken as written. */
function untilDate(text: string, tz: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})(T(\d{2})(\d{2})(\d{2})(Z?))?$/.exec(text);
  if (!m) return null;
  try {
    if (m[8] === "Z") return dayOf(ms(`${m[1]}-${m[2]}-${m[3]}T${m[5]}:${m[6]}:${m[7]}Z`), tz);
    return Temporal.PlainDate.from(`${m[1]}-${m[2]}-${m[3]}`).toString();
  } catch {
    return null;
  }
}

function ruleOf(series: CalendarEvent): RRuleTemporal {
  return new RRuleTemporal({ rruleString: series.rrule ?? "", dtstart: zoned(ms(series.start_at), series.time_zone) });
}

function isOccurrence(rule: RRuleTemporal, at: number): boolean {
  if (Number.isNaN(at)) return false;
  return rule.between(new Date(at), new Date(at), true).some((z) => z.epochMilliseconds === at);
}

/** The longest an occurrence of the row can last (all-day days can be 25 h with summer time). */
function maxLength(row: CalendarEvent): number {
  const length = Math.max(0, ms(row.end_at) - ms(row.start_at));
  return row.all_day ? length + HOUR : length;
}

/** When an occurrence of `row` that starts at `start` ends: same length, or same number of days for all-day. */
function endFor(row: CalendarEvent, start: number): number {
  if (!row.all_day) return start + ms(row.end_at) - ms(row.start_at);
  const days = zoned(ms(row.start_at), row.time_zone)
    .toPlainDate()
    .until(zoned(ms(row.end_at), row.time_zone).toPlainDate()).days;
  return midnight(zoned(start, row.time_zone).toPlainDate().add({ days }), row.time_zone);
}

function draw(
  row: CalendarEvent,
  key: string,
  seriesId: string | null,
  originalStart: string | null,
  start: number,
  end: number,
  broken: boolean,
): Drawn {
  const show = (t: number) => (row.all_day ? dayOf(t, row.time_zone) : iso(t));
  return {
    sort: start,
    occ: {
      key,
      eventId: row.id,
      seriesId,
      originalStart,
      title: row.title,
      allDay: row.all_day,
      start: show(start),
      end: show(end),
      broken,
    },
  };
}

/** The occurrence's start and end as instants ("YYYY-MM-DD" = midnight in the zone). */
function occurrenceTimes(occurrence: Occurrence, tz: string): [number, number] {
  const at = (text: string) => (occurrence.allDay ? midnight(Temporal.PlainDate.from(text), tz) : ms(text));
  return [at(occurrence.start), at(occurrence.end)];
}

/** The exception row behind this occurrence: the occurrence itself, or one for the same original start. */
function exceptionFor(events: CalendarEvent[], occurrence: Occurrence): CalendarEvent | undefined {
  const original = ms(occurrence.originalStart ?? "");
  return (
    events.find((e) => e.id === occurrence.eventId && e.series_id === occurrence.seriesId) ??
    events
      .filter((e) => e.series_id === occurrence.seriesId && ms(e.original_start ?? "") === original)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]
  );
}

function newException(series: CalendarEvent, occurrence: Occurrence, ctx: Ctx): CalendarEvent {
  const [start, end] = occurrenceTimes(occurrence, series.time_zone);
  return {
    ...series,
    id: ctx.newId(),
    rrule: null,
    series_id: series.id,
    original_start: iso(ms(occurrence.originalStart ?? "")),
    cancelled: false,
    start_at: iso(start),
    end_at: iso(end),
    created_at: ctx.now,
    updated_at: ctx.now,
  };
}

/**
 * The series' rule cut to end just before the occurrence at `at` (`cut`), and the rule for a
 * new series starting there (`rest`). A COUNT is shared between the two; otherwise the old
 * rule gets UNTIL one second before the occurrence and the new one keeps the rule as it was.
 */
function split(series: CalendarEvent, at: number): { cut: string; rest: string } {
  const parts = (series.rrule ?? "").split(";");
  const count = parts.find((p) => p.startsWith("COUNT="));
  if (count) {
    const before = ruleOf(series).between(new Date(ms(series.start_at)), new Date(at - 1), true).length;
    const left = Math.max(1, Number(count.slice("COUNT=".length)) - before);
    const withCount = (n: number) => parts.map((p) => (p === count ? `COUNT=${n}` : p)).join(";");
    return { cut: withCount(before), rest: withCount(left) };
  }
  const cut = [...parts.filter((p) => !p.startsWith("UNTIL=")), `UNTIL=${utcStamp(at - 1000)}`].join(";");
  return { cut, rest: series.rrule ?? "" };
}
