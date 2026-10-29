// Calendar: FullCalendar's year / month / week / day views in the main area, or the event form.
// The tool panel switches view and slot size. Rules live in calendar/calendar.ts, screen helpers in
// calendar/display.ts, database writes in calendar/store.ts. Spec: calendar_spec.

import FullCalendar, {
  type CalendarRef,
  type DateClickInfo,
  type DateSelectInfo,
  type DatesSetInfo,
  type DayCellInfo,
  type EventChangeInfo,
  type EventClickInfo,
  type EventInput,
} from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import multiMonthPlugin from "@fullcalendar/react/multimonth";
import classicThemePlugin from "@fullcalendar/react/themes/classic";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import "@fullcalendar/react/themes/classic/palette.css";
import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import {
  applyChange,
  archiveOccurrence,
  fromRRule,
  newEvent,
  occurrences,
  validTimes,
  type CalendarEvent,
  type Change,
  type Occurrence,
  type Repeat,
  type Scope,
} from "../calendar/calendar";
import {
  applyWrites,
  daysWithEvents,
  droppedTimes,
  findOccurrence,
  formChange,
  fromSelection,
  inputTimes,
  loadPrefs,
  localDay,
  moveStart,
  nextOccurrence,
  savePrefs,
  storedTimes,
  switchAllDay,
  VIEWS,
  weekdayOf,
  WEEKDAYS,
  type FormValues,
  type Prefs,
  type ViewId,
} from "../calendar/display";
import { ctx, deviceTimeZone, useEvents, write } from "../calendar/store";
import { Layout, PHONE } from "../layout/Layout";

const CALENDAR = "/tools/calendar";
const formUrl = (key: string) => `${CALENDAR}/${encodeURIComponent(key)}`;

/** /tools/calendar → the calendar; /tools/calendar/<occurrence key> → the event form. */
export function CalendarScreen() {
  const { occurrence } = useParams();
  return occurrence ? <EventForm occurrenceKey={occurrence} /> : <CalendarView />;
}

// The date on screen, so coming back from the form shows the same week. Kept while the app runs.
let shownDate: Date | null = null;

// ---- Calendar ----

const PLUGINS = [classicThemePlugin, dayGridPlugin, timeGridPlugin, multiMonthPlugin, interactionPlugin];
const VIEW_BUTTONS = VIEWS.map((v) => v.id).join(",");
const PC_HEADER = { start: "prev,next today", center: "title", end: `${VIEW_BUTTONS} slot` };
const PHONE_HEADER = { start: "prev,next", center: "title", end: "today" };
const PHONE_FOOTER = { center: `${VIEW_BUTTONS} slot` };
const BUTTONS = { today: { text: "Today" }, ...Object.fromEntries(VIEWS.map((v) => [v.id, { text: v.label }])) };
const TIME_FORMAT = { hour: "2-digit", minute: "2-digit", hour12: false } as const; // 24 h
const VIEW_OPTIONS = { multiMonthYear: { selectable: false, editable: false } }; // the year view only shows dots

type Range = { from: string; to: string; view: string };
type Pending = { occurrence: Occurrence; change: Change; revert: () => void }; // a dragged series occurrence

function CalendarView() {
  const rows = useEvents();
  const navigate = useNavigate();
  const calendar = useRef<CalendarRef>(null);
  const [prefs, setPrefs] = useState(loadPrefs);
  const [range, setRange] = useState<Range | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [phone] = useState(() => window.matchMedia(PHONE).matches);

  const shown = useMemo(() => (rows && range ? occurrences(rows, range.from, range.to) : []), [rows, range]);
  const byKey = useMemo(() => new Map(shown.map((o) => [o.key, o])), [shown]);
  const isYear = range?.view === "multiMonthYear";
  // The year view shows a dot on days with events instead of the events
  const dots = useMemo(() => (isYear ? daysWithEvents(shown) : new Set<string>()), [shown, isYear]);
  const events = useMemo(() => (isYear ? [] : shown.map(toInput)), [shown, isYear]);

  const updatePrefs = (change: (current: Prefs) => Partial<Prefs>) =>
    setPrefs((current) => {
      const next = { ...current, ...change(current) };
      if (next.view === current.view && next.slot === current.slot) return current;
      savePrefs(next);
      return next;
    });
  const api = () => calendar.current?.getApi();

  function datesSet(info: DatesSetInfo) {
    shownDate = info.view.currentStart;
    const next = { from: info.start.toISOString(), to: info.end.toISOString(), view: info.view.type };
    setRange((r) => (r && r.from === next.from && r.to === next.to && r.view === next.view ? r : next));
    updatePrefs(() => ({ view: info.view.type as ViewId }));
  }

  // A tap on a slot (or a long-press on the phone) makes a 30-minute event; a drag, that length
  async function create(info: DateSelectInfo) {
    api()?.unselect();
    const { start, end } = fromSelection(info.start, info.end, info.allDay, prefs.slot);
    const event = newEvent(crypto.randomUUID(), start, end, info.allDay, deviceTimeZone(), ctx().now);
    await write({ put: [event], archive: [] });
    navigate(`${formUrl(event.id)}?new=1`);
  }

  // Year view: a tap on a day opens that day
  function dateClick(info: DateClickInfo) {
    if (info.view.type === "multiMonthYear") api()?.changeView("timeGridDay", info.date);
  }

  function open(info: EventClickInfo) {
    navigate(formUrl(info.event.id));
  }

  // Moved or resized: a series occurrence first asks which part it applies to
  function changed(info: EventChangeInfo) {
    const occurrence = byKey.get(info.event.id);
    const row = rows?.find((r) => r.id === occurrence?.eventId);
    if (!occurrence || !row || !info.event.start) return info.revert();
    const change: Change = droppedTimes(info.event.start, info.event.end, info.event.allDay, row.time_zone);
    if (!validTimes(change.start_at!, change.end_at!)) return info.revert();
    if (info.event.allDay !== occurrence.allDay) change.all_day = info.event.allDay;
    if (occurrence.seriesId) setPending({ occurrence, change, revert: info.revert });
    else apply(occurrence, "all", change);
  }

  function apply(occurrence: Occurrence, scope: Scope, change: Change) {
    if (!rows) return;
    write(applyChange(rows, occurrence, scope, change, ctx())).catch(console.error);
  }

  // Options FullCalendar compares: built only when what they show changes
  const buttons = useMemo(
    () => ({
      ...BUTTONS,
      slot: { text: `${prefs.slot} min`, hint: "Slot size", click: () => updatePrefs((p) => ({ slot: p.slot === 30 ? 15 : 30 })) },
    }),
    [prefs.slot],
  );
  const dayCellClass = useCallback((info: DayCellInfo) => (dots.has(localDay(info.date)) ? "cal-dot" : ""), [dots]);

  return (
    <Layout
      title="Calendar"
      tools={
        <CalendarTools
          view={range?.view}
          slot={prefs.slot}
          onView={(view) => api()?.changeView(view)}
          onSlot={(slot) => updatePrefs(() => ({ slot }))}
          onToday={() => api()?.today()}
        />
      }
    >
      <div className="cal">
        {rows === null ? (
          <p className="muted">Loading…</p>
        ) : (
          <FullCalendar
            ref={calendar}
            plugins={PLUGINS}
            initialView={prefs.view}
            initialDate={shownDate ?? undefined}
            // The phone has no room for everything in one row: the views go under the calendar
            headerToolbar={phone ? PHONE_HEADER : PC_HEADER}
            footerToolbar={phone ? PHONE_FOOTER : false}
            buttons={buttons}
            height="100%"
            firstDay={1}
            scrollTime="08:00:00"
            slotDuration={prefs.slot === 15 ? "00:15:00" : "00:30:00"}
            slotHeaderFormat={TIME_FORMAT}
            eventTimeFormat={TIME_FORMAT}
            nowIndicator
            editable
            selectable
            selectMirror
            forceEventDuration
            views={VIEW_OPTIONS}
            events={events}
            dayCellClass={dayCellClass}
            datesSet={datesSet}
            select={create}
            dateClick={dateClick}
            eventClick={open}
            eventDrop={changed}
            eventResize={changed}
          />
        )}
      </div>

      {pending && (
        <ScopeDialog
          question="Move which events?"
          onPick={(scope) => {
            apply(pending.occurrence, scope, pending.change);
            setPending(null);
          }}
          onCancel={() => {
            pending.revert();
            setPending(null);
          }}
        />
      )}
    </Layout>
  );
}

/** What FullCalendar draws for an occurrence; the id is the occurrence key. A broken rule gets a mark. */
function toInput(o: Occurrence): EventInput {
  return {
    id: o.key,
    title: `${o.broken ? "⚠ " : ""}${o.title.trim() || "(no title)"}`,
    start: o.start,
    end: o.end,
    allDay: o.allDay,
    editable: !o.broken,
    className: o.broken ? "cal-broken" : "",
  };
}

type ToolsProps = {
  view: string | undefined;
  slot: number;
  onView: (view: ViewId) => void;
  onSlot: (slot: 15 | 30) => void;
  onToday: () => void;
};

function CalendarTools({ view, slot, onView, onSlot, onToday }: ToolsProps) {
  return (
    <div className="details">
      <button onClick={onToday}>Today</button>
      <h3>View</h3>
      <div className="cal-choices">
        {VIEWS.map((v) => (
          <button key={v.id} className={v.id === view ? "on" : ""} onClick={() => onView(v.id)}>
            {v.label}
          </button>
        ))}
      </div>
      <h3>Slot size</h3>
      <div className="cal-choices">
        {([15, 30] as const).map((minutes) => (
          <button key={minutes} className={minutes === slot ? "on" : ""} onClick={() => onSlot(minutes)}>
            {minutes} min
          </button>
        ))}
      </div>
    </div>
  );
}

/** Which part of a repeating event an edit or archive applies to. */
function ScopeDialog({ question, onPick, onCancel }: { question: string; onPick: (scope: Scope) => void; onCancel: () => void }) {
  return (
    <div className="cal-backdrop" onClick={onCancel}>
      <div className="cal-dialog" role="dialog" aria-label={question} onClick={(e) => e.stopPropagation()}>
        <p>{question}</p>
        <button onClick={() => onPick("only")}>Only this one</button>
        <button onClick={() => onPick("following")}>This and following</button>
        <button onClick={() => onPick("all")}>All</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ---- Event form ----

type FormState = "loading" | "ready" | "missing" | "gone" | "lost";

/**
 * Saves on its own a moment after typing stops and on leaving, like the notes editor. For an
 * occurrence of a repeating event the first change asks which part it applies to; Cancel puts
 * the form back. The URL follows the occurrence when a save gives it a new key.
 */
function EventForm({ occurrenceKey }: { occurrenceKey: string }) {
  const rows = useEvents();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [state, setState] = useState<FormState>("loading");
  const [values, setValues] = useState<FormValues | null>(null);
  const [scope, setScope] = useState<Scope | null>(null); // null = not asked yet (series only)
  const [asking, setAsking] = useState<"edit" | "archive" | null>(null);
  const [problem, setProblem] = useState("");

  // Refs: read by the save on leaving, after the last render
  const valuesRef = useRef<FormValues | null>(null);
  const saved = useRef<FormValues | null>(null); // what's stored
  const occurrence = useRef<Occurrence | null>(null); // what the next save changes
  const scopeRef = useRef<Scope | null>(null);
  const rowsRef = useRef<CalendarEvent[]>([]); // the rows the next save builds on
  const timeZone = useRef("");
  const archived = useRef(false);
  const queue = useRef(Promise.resolve()); // writes one after another
  const writing = useRef(0); // writes not finished yet

  useEffect(() => {
    if (!rows) return;
    // While our own write is unfinished, our copy is newer than what the database sent
    if (writing.current === 0) rowsRef.current = rows;
    if (state === "loading") {
      const found = findOccurrence(rows, occurrenceKey);
      const row = rows.find((r) => r.id === found?.eventId);
      if (!found || !row) return setState("missing");
      const ruleRow = rows.find((r) => r.id === found.seriesId) ?? row;
      const loaded: FormValues = {
        title: found.title,
        notes: row.notes,
        allDay: found.allDay,
        ...inputTimes(found),
        repeat: fromRRule(ruleRow.rrule, ruleRow.time_zone),
      };
      occurrence.current = found;
      timeZone.current = row.time_zone;
      saved.current = valuesRef.current = loaded;
      scopeRef.current = found.seriesId ? null : "all";
      setScope(scopeRef.current);
      setValues(loaded);
      setState("ready");
      return;
    }
    // The row left the device: archived elsewhere, or the server refused the change (archived = locked)
    const id = occurrence.current?.eventId;
    if (state === "ready" && writing.current === 0 && !archived.current && id && !rows.some((r) => r.id === id)) {
      setState("gone");
    }
  }, [rows]);

  function save(leaving: boolean) {
    const current = occurrence.current;
    const next = valuesRef.current;
    const scope = scopeRef.current;
    if (archived.current || !current || !next || !saved.current || !scope) return;
    const change = formChange(next, saved.current, timeZone.current);
    if (scope === "only") delete change.rrule; // one occurrence keeps the series' rule
    if (Object.keys(change).length === 0) return;
    const times = storedTimes(next, timeZone.current);
    if (!validTimes(times.start_at, times.end_at)) {
      setProblem("The end must be after the start. Not saved.");
      return;
    }
    const writes = applyChange(rowsRef.current, current, scope, change, ctx());
    rowsRef.current = applyWrites(rowsRef.current, writes);
    saved.current = next;
    occurrence.current = nextOccurrence(rowsRef.current, current, scope, writes, times.start_at);
    writing.current++;
    queue.current = queue.current
      .then(() => write(writes))
      .catch(console.error)
      .finally(() => writing.current--);
    if (leaving) return;
    if (!occurrence.current) setState("lost");
    else if (occurrence.current.key !== current.key) navigate(formUrl(occurrence.current.key), { replace: true });
  }

  // Save a moment after typing stops
  useEffect(() => {
    if (state !== "ready") return;
    const timer = setTimeout(() => save(false), 800);
    return () => clearTimeout(timer);
  }, [values, scope, state]);

  // Save when leaving the form, and when the app goes to the background (Android may close it)
  useEffect(() => {
    const hidden = () => {
      if (document.visibilityState === "hidden") save(true);
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      save(true);
    };
  }, []);

  const edit = (next: FormValues) => {
    valuesRef.current = next;
    setValues(next);
    setProblem("");
    if (scopeRef.current === null) setAsking("edit");
  };

  function pickEditScope(picked: Scope) {
    scopeRef.current = picked;
    setScope(picked);
    setAsking(null);
    // One occurrence can't change the rule: the repeat part goes back and stays locked
    if (picked === "only" && valuesRef.current && saved.current) edit({ ...valuesRef.current, repeat: saved.current.repeat });
  }

  function cancelEdit() {
    valuesRef.current = saved.current;
    setValues(saved.current);
    setAsking(null);
  }

  function archive(picked: Scope) {
    const current = occurrence.current;
    if (!current) return;
    archived.current = true;
    const writes = archiveOccurrence(rowsRef.current, current, picked, ctx());
    queue.current = queue.current.then(() => write(writes)).catch(console.error);
    navigate(CALENDAR, { replace: true });
  }

  const back = (
    <button className="back" onClick={() => navigate(CALENDAR)}>
      <ArrowLeft size={16} /> Calendar
    </button>
  );

  if (state === "missing" || state === "gone" || state === "lost") {
    const message = {
      missing: "This event isn't on this device. It may have been archived — see the Archive page.",
      gone: "This event was archived on another device, so it can't be changed here. Restore it from the Archive page first.",
      lost: "Saved. Open the event again from the calendar to change it further.",
    }[state];
    return (
      <Layout title="Calendar">
        <p className="muted">{message}</p>
        <Link to={CALENDAR}>Back to the calendar</Link>
      </Layout>
    );
  }

  if (!values) {
    return (
      <Layout title="Calendar">
        <p className="muted">Loading…</p>
      </Layout>
    );
  }

  const series = occurrence.current?.seriesId != null;
  const timeType = values.allDay ? "date" : "datetime-local";

  return (
    <Layout title="Calendar">
      <div className="editor cal-form">
        {back}
        <input
          className="note-title-box"
          value={values.title}
          placeholder="Title"
          autoFocus={params.get("new") === "1"}
          onChange={(e) => edit({ ...values, title: e.target.value })}
        />
        <label className="cal-check">
          <input type="checkbox" checked={values.allDay} onChange={(e) => edit(switchAllDay(values, e.target.checked))} />
          All day
        </label>
        <div className="cal-times">
          <label>
            Start
            <input type={timeType} value={values.start} onChange={(e) => edit(moveStart(values, e.target.value))} />
          </label>
          <label>
            {values.allDay ? "Last day" : "End"}
            <input type={timeType} value={values.end} onChange={(e) => edit({ ...values, end: e.target.value })} />
          </label>
        </div>
        {problem && <p className="error">{problem}</p>}
        <RepeatField
          repeat={values.repeat}
          startDay={values.start.slice(0, 10)}
          locked={scope === "only"}
          onChange={(repeat) => edit({ ...values, repeat })}
        />
        <textarea
          value={values.notes}
          placeholder="Notes"
          onChange={(e) => edit({ ...values, notes: e.target.value })}
        />
        <button className="cal-archive" onClick={() => (series ? setAsking("archive") : archive("all"))}>
          Archive event
        </button>
      </div>

      {asking === "edit" && <ScopeDialog question="Change which events?" onPick={pickEditScope} onCancel={cancelEdit} />}
      {asking === "archive" && (
        <ScopeDialog question="Archive which events?" onPick={archive} onCancel={() => setAsking(null)} />
      )}
    </Layout>
  );
}

const FREQS: { value: Repeat["freq"]; label: string; unit: string }[] = [
  { value: "none", label: "Doesn't repeat", unit: "" },
  { value: "daily", label: "Every day", unit: "days" },
  { value: "weekly", label: "Every week", unit: "weeks" },
  { value: "monthly", label: "Every month (same date)", unit: "months" },
  { value: "yearly", label: "Every year", unit: "years" },
];

type RepeatProps = { repeat: Repeat | null; startDay: string; locked: boolean; onChange: (repeat: Repeat) => void };

/** The repeat part of the form. A rule it can't show is left as it is. */
function RepeatField({ repeat, startDay, locked, onChange }: RepeatProps) {
  if (!repeat) {
    return (
      <div className="cal-repeat">
        <span className="cal-label">Repeat</span>
        <p className="muted">Custom repeat — kept as it is.</p>
      </div>
    );
  }
  const set = (change: Partial<Repeat>) => onChange({ ...repeat, ...change });
  const count = (value: string) => Math.max(1, Math.floor(Number(value)) || 1);
  // No days chosen = the start's weekday
  const days = repeat.byDay.length > 0 ? repeat.byDay : [weekdayOf(startDay)];
  const toggleDay = (day: (typeof WEEKDAYS)[number]) => {
    const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
    set({ byDay: WEEKDAYS.filter((d) => next.includes(d)) });
  };
  const freq = FREQS.find((f) => f.value === repeat.freq)!;

  return (
    <fieldset className="cal-repeat" disabled={locked}>
      <label>
        <span className="cal-label">Repeat{locked && " (only this one: the series' rule stays)"}</span>
        <select value={repeat.freq} onChange={(e) => set({ freq: e.target.value as Repeat["freq"] })}>
          {FREQS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      {repeat.freq !== "none" && (
        <>
          <label className="cal-inline">
            Every
            <input type="number" min={1} value={repeat.interval} onChange={(e) => set({ interval: count(e.target.value) })} />
            {freq.unit}
          </label>
          {repeat.freq === "weekly" && (
            <div className="cal-choices">
              {WEEKDAYS.map((day) => (
                <button key={day} type="button" className={days.includes(day) ? "on" : ""} onClick={() => toggleDay(day)}>
                  {day[0] + day[1].toLowerCase()}
                </button>
              ))}
            </div>
          )}
          <label className="cal-inline">
            Ends
            <select
              value={repeat.end.kind}
              onChange={(e) => {
                const kind = e.target.value;
                set({
                  end:
                    kind === "on"
                      ? { kind: "on", date: startDay }
                      : kind === "count"
                        ? { kind: "count", count: 10 }
                        : { kind: "never" },
                });
              }}
            >
              <option value="never">Never</option>
              <option value="on">On a date</option>
              <option value="count">After a number of times</option>
            </select>
          </label>
          {repeat.end.kind === "on" && (
            <input type="date" value={repeat.end.date} onChange={(e) => set({ end: { kind: "on", date: e.target.value } })} />
          )}
          {repeat.end.kind === "count" && (
            <label className="cal-inline">
              <input
                type="number"
                min={1}
                value={repeat.end.count}
                onChange={(e) => set({ end: { kind: "count", count: count(e.target.value) } })}
              />
              times
            </label>
          )}
        </>
      )}
    </fieldset>
  );
}
