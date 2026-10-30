// Calendar: FullCalendar's year / month / week / day views in the main area. The event form opens
// in the tool panel on the PC and as its own screen on the phone; otherwise the tool panel lists
// one day's events. Days are split into 30-minute slots. Rules live in calendar/calendar.ts, screen helpers in
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
import { ArrowLeft, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useBlocker, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
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
  type ShowAs,
} from "../calendar/calendar";
import {
  applyWrites,
  dayHeading,
  daysWithEvents,
  eventsOfDay,
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
  shortTitle,
  shownInMonthAndYear,
  storedTimes,
  switchAllDay,
  SLOT_MINUTES,
  timeChoices,
  timeLabel,
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

/**
 * /tools/calendar → the calendar; /tools/calendar/<occurrence key> → the event form: in the tool
 * panel on the PC, its own screen on the phone (so Android's back gesture returns to the calendar).
 */
export function CalendarScreen() {
  const { occurrence } = useParams();
  const [phone] = useState(() => window.matchMedia(PHONE).matches);
  if (occurrence && phone) return <EventForm occurrenceKey={occurrence} panel={false} />;
  return <CalendarView openKey={occurrence} />;
}

// Opening an event puts a new number in the history state; the form is rebuilt for each one. The
// form's own address changes (a save can give the occurrence a new key) keep the number.
type OpenState = { form?: number } | null;

// The date on screen, so coming back from the form shows the same week. Kept while the app runs.
let shownDate: Date | null = null;

// ---- Calendar ----

const PLUGINS = [classicThemePlugin, dayGridPlugin, timeGridPlugin, multiMonthPlugin, interactionPlugin];
const VIEW_BUTTONS = VIEWS.map((v) => v.id).join(",");
const PC_HEADER = { start: "prev,next,today", center: "title", end: VIEW_BUTTONS }; // ‹ › Today joined, like the phone
const PHONE_HEADER = { start: "prev,next,today", center: "", end: "title" }; // one button group
const PHONE_FOOTER = { center: VIEW_BUTTONS };
const BUTTONS = { today: { text: "Today" }, ...Object.fromEntries(VIEWS.map((v) => [v.id, { text: v.label }])) };
const TIME_FORMAT = { hour: "2-digit", minute: "2-digit", hour12: false } as const; // 24 h
const VIEW_OPTIONS = { multiMonthYear: { selectable: false, editable: false } }; // the year view only shows dots
// The title is short (DD MMM YY) on both, so Today fits next to the arrows (the PC follows the phone)
type TitleInfo = { start: { year: number; month: number; day: number } }; // month 0-11
const shortTitleOf = (view: ViewId) => (info: TitleInfo) =>
  shortTitle(view, { ...info.start, month: info.start.month + 1 });
const withTitles = (options: Record<string, object>) =>
  Object.fromEntries(VIEWS.map((v) => [v.id, { ...options[v.id], titleFormat: shortTitleOf(v.id) }]));
const PHONE_VIEW_OPTIONS = withTitles(VIEW_OPTIONS);
// PC month view: a click shows the day's events in the panel; a drag (even inside one day) creates
const PC_VIEW_OPTIONS = withTitles({ ...VIEW_OPTIONS, dayGridMonth: { selectMinDistance: 5 } });

type Range = { from: string; to: string; view: string };
type Pending = { occurrence: Occurrence; change: Change; revert: () => void }; // a dragged series occurrence

function CalendarView({ openKey }: { openKey: string | undefined }) {
  const rows = useEvents();
  const navigate = useNavigate();
  const formId = (useLocation().state as OpenState)?.form ?? 0;
  const calendar = useRef<CalendarRef>(null);
  const [prefs, setPrefs] = useState(loadPrefs);
  const [range, setRange] = useState<Range | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [phone] = useState(() => window.matchMedia(PHONE).matches);
  // The day listed in the tool panel: today at first, then the day clicked, or the day shown in day view
  const [picked, setPicked] = useState(() => localDay(new Date()));

  const shown = useMemo(() => (rows && range ? occurrences(rows, range.from, range.to) : []), [rows, range]);
  const byKey = useMemo(() => new Map(shown.map((o) => [o.key, o])), [shown]);
  const isYear = range?.view === "multiMonthYear";
  const isWide = isYear || range?.view === "dayGridMonth"; // month and year: Busy only
  // The year view shows a dot on days with events instead of the events
  const dots = useMemo(
    () => (isYear ? daysWithEvents(shown.filter(shownInMonthAndYear)) : new Set<string>()),
    [shown, isYear],
  );
  const dayList = useMemo(() => (rows ? eventsOfDay(rows, picked) : []), [rows, picked]);
  // The event open in the panel, and the rest of its series, can't be dragged: its times change in
  // the form, so a drag and the form don't overwrite each other
  const locked = useMemo(() => {
    const open = rows && openKey ? findOccurrence(rows, openKey) : null;
    return new Set([open?.eventId, open?.seriesId].filter((id) => id != null));
  }, [rows, openKey]);
  const events = useMemo(
    () =>
      isYear
        ? []
        : shown
            .filter((o) => !isWide || shownInMonthAndYear(o))
            .map((o) => toInput(o, locked.has(o.eventId) || locked.has(o.seriesId ?? ""))),
    [shown, isYear, isWide, locked],
  );
  const openForm = (key: string, search = "") => navigate(formUrl(key) + search, { state: { form: Date.now() } });

  const updatePrefs = (change: (current: Prefs) => Partial<Prefs>) =>
    setPrefs((current) => {
      const next = { ...current, ...change(current) };
      if (next.view === current.view) return current;
      savePrefs(next);
      return next;
    });
  const api = () => calendar.current?.getApi();

  function datesSet(info: DatesSetInfo) {
    shownDate = info.view.currentStart;
    const next = { from: info.start.toISOString(), to: info.end.toISOString(), view: info.view.type };
    setRange((r) => (r && r.from === next.from && r.to === next.to && r.view === next.view ? r : next));
    updatePrefs(() => ({ view: info.view.type as ViewId }));
    if (info.view.type === "timeGridDay") setPicked(localDay(info.view.currentStart));
  }

  // A tap on a slot (or a long-press on the phone) makes a 30-minute event; a drag, that length
  async function create(info: DateSelectInfo) {
    api()?.unselect();
    const { start, end } = fromSelection(info.start, info.end, info.allDay);
    const event = newEvent(crypto.randomUUID(), start, end, info.allDay, deviceTimeZone(), ctx().now);
    await write({ put: [event], archive: [] });
    openForm(event.id, "?new=1");
  }

  // A click on a day lists it in the tool panel. Phone, year view: a tap opens that day instead.
  function dateClick(info: DateClickInfo) {
    setPicked(localDay(info.date));
    if (phone && info.view.type === "multiMonthYear") api()?.changeView("timeGridDay", info.date);
  }

  function open(info: EventClickInfo) {
    if (info.event.id !== openKey) openForm(info.event.id);
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

  const dayCellClass = useCallback(
    (info: DayCellInfo) => {
      const day = localDay(info.date);
      return [dots.has(day) && "cal-dot", isWide && day === picked && "cal-picked"].filter(Boolean).join(" ");
    },
    [dots, isWide, picked],
  );

  return (
    <Layout
      title="Calendar"
      showTools={openKey && String(formId)}
      tools={
        openKey ? (
          <EventForm key={formId} occurrenceKey={openKey} panel />
        ) : (
          <DayList day={picked} events={dayList} onOpen={openForm} />
        )
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
            buttons={BUTTONS}
            height="100%"
            firstDay={1}
            scrollTime="08:00:00"
            slotDuration={{ minutes: SLOT_MINUTES }}
            slotHeaderFormat={TIME_FORMAT}
            eventTimeFormat={TIME_FORMAT}
            nowIndicator
            editable
            selectable
            selectMirror
            forceEventDuration
            views={phone ? PHONE_VIEW_OPTIONS : PC_VIEW_OPTIONS}
            toolbarTitleClass="cal-title"
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

const SHOW_AS: { value: ShowAs; label: string }[] = [
  { value: "busy", label: "Busy" },
  { value: "tentative", label: "Tentative" },
  { value: "free", label: "Free" },
];

/**
 * What FullCalendar draws for an occurrence; the id is the occurrence key. Tentative and free get
 * their own look; a broken rule gets a mark. `locked` = open in the form: no dragging.
 */
function toInput(o: Occurrence, locked: boolean): EventInput {
  return {
    id: o.key,
    title: `${o.broken ? "⚠ " : ""}${o.title.trim() || "(no title)"}`,
    start: o.start,
    end: o.end,
    allDay: o.allDay,
    editable: !o.broken && !locked,
    className: [o.broken && "cal-broken", o.showAs !== "busy" && `cal-${o.showAs}`].filter(Boolean).join(" "),
  };
}

type DayListProps = { day: string; events: Occurrence[]; onOpen: (key: string) => void };

const SHOW_AS_LABEL: Record<ShowAs, string> = { busy: "", tentative: " · Tentative", free: " · Free" };

/** The tool panel: one day's events, all statuses, each marked. Today and the views are in the calendar's toolbar. */
function DayList({ day, events, onOpen }: DayListProps) {
  return (
    <div className="details">
      <h3>{dayHeading(day)}</h3>
      {events.length === 0 ? (
        <p className="muted">No events.</p>
      ) : (
        <ul className="cal-day-list">
          {events.map((o) => (
            <li key={o.key}>
              <button className={`cal-day-item cal-${o.showAs}`} onClick={() => onOpen(o.key)}>
                <span className="cal-day-title">{o.title.trim() || "(no title)"}</span>
                <span className="cal-day-meta">
                  {timeLabel(o)}
                  {SHOW_AS_LABEL[o.showAs]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type ScopeProps = {
  question: string;
  noOnly?: boolean; // the repeat changed: one occurrence can't take a new rule
  onPick: (scope: Scope) => void;
  onCancel: () => void;
};

/** Which part of a repeating event an edit or archive applies to. */
function ScopeDialog({ question, noOnly = false, onPick, onCancel }: ScopeProps) {
  return (
    <div className="cal-backdrop" onClick={onCancel}>
      <div className="cal-dialog" role="dialog" aria-label={question} onClick={(e) => e.stopPropagation()}>
        <p>{question}</p>
        <button disabled={noOnly} onClick={() => onPick("only")}>
          Only this one{noOnly && " (not with a new repeat)"}
        </button>
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
 * A one-off saves on its own a moment after typing stops and on leaving, like the notes editor.
 * An occurrence of a repeating event has Save and Discard instead: Save asks which part the
 * changes apply to, and leaving with unsaved changes asks Save / Discard / Keep editing
 * (Mihail, 2026-10-30). The URL follows the occurrence when a save gives it a new key.
 * panel: inside the calendar's tool panel (PC); otherwise its own screen (phone).
 */
function EventForm({ occurrenceKey, panel }: { occurrenceKey: string; panel: boolean }) {
  const rows = useEvents();
  const navigate = useNavigate();
  const { state: openState } = useLocation();
  const [params] = useSearchParams();
  const [state, setState] = useState<FormState>("loading");
  const [values, setValues] = useState<FormValues | null>(null);
  const [asking, setAsking] = useState<"save" | "leave" | "archive" | null>(null);
  const [problem, setProblem] = useState("");
  const [, setSaves] = useState(0); // a save re-renders: Save and Discard grey out

  // Refs: read by the save on leaving, after the last render
  const valuesRef = useRef<FormValues | null>(null);
  const saved = useRef<FormValues | null>(null); // what's stored
  const occurrence = useRef<Occurrence | null>(null); // what the next save changes
  const scopeRef = useRef<Scope | null>(null); // "all" for a one-off; null for a series (asked at each Save)
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
        showAs: found.showAs,
        repeat: fromRRule(ruleRow.rrule, ruleRow.time_zone),
      };
      occurrence.current = found;
      timeZone.current = row.time_zone;
      saved.current = valuesRef.current = loaded;
      scopeRef.current = found.seriesId ? null : "all";
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

  /** Saves the changes; `picked` = the part of a series they apply to. */
  function save(leaving: boolean, picked?: Scope) {
    const current = occurrence.current;
    const next = valuesRef.current;
    const scope = picked ?? scopeRef.current;
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
    // A one-off that now repeats gets Save and Discard from here on
    scopeRef.current = occurrence.current?.seriesId ? null : "all";
    setSaves((n) => n + 1);
    writing.current++;
    queue.current = queue.current
      .then(() => write(writes))
      .catch(console.error)
      .finally(() => writing.current--);
    if (leaving) return;
    if (!occurrence.current) setState("lost");
    else if (occurrence.current.key !== current.key) navigate(formUrl(occurrence.current.key), { replace: true, state: openState });
  }

  // Save a moment after typing stops
  useEffect(() => {
    if (state !== "ready") return;
    const timer = setTimeout(() => save(false), 800);
    return () => clearTimeout(timer);
  }, [values, state]);

  // A one-off saves when leaving the form, and when the app goes to the background (Android may
  // close it). A series' unsaved changes stay in the form; leaving asks first (below).
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
  };

  const unsaved = () => {
    const next = valuesRef.current;
    return !archived.current && !!next && !!saved.current && Object.keys(formChange(next, saved.current, timeZone.current)).length > 0;
  };
  const isSeries = () => occurrence.current?.seriesId != null;

  // Leaving a series with unsaved changes (back, close, another event, another screen) asks first
  const blocker = useBlocker(() => state === "ready" && isSeries() && unsaved());

  /** The times are checked before asking which part a save applies to. */
  function timesOk(): boolean {
    const next = valuesRef.current;
    const times = next ? storedTimes(next, timeZone.current) : null;
    if (times && validTimes(times.start_at, times.end_at)) return true;
    setProblem("The end must be after the start. Not saved.");
    return false;
  }

  function discard() {
    valuesRef.current = saved.current;
    setValues(saved.current);
    setProblem("");
  }

  function archive(picked: Scope) {
    const current = occurrence.current;
    if (!current) return;
    archived.current = true;
    const writes = archiveOccurrence(rowsRef.current, current, picked, ctx());
    queue.current = queue.current.then(() => write(writes)).catch(console.error);
    navigate(CALENDAR, { replace: true });
  }

  const back = panel ? (
    <button className="back" onClick={() => navigate(CALENDAR)}>
      <X size={16} /> Close
    </button>
  ) : (
    <button className="back" onClick={() => navigate(CALENDAR)}>
      <ArrowLeft size={16} /> Calendar
    </button>
  );
  const frame = (content: ReactNode) => (panel ? content : <Layout title="Calendar">{content}</Layout>);

  if (state === "missing" || state === "gone" || state === "lost") {
    const message = {
      missing: "This event isn't on this device. It may have been archived — see the Archive page.",
      gone: "This event was archived on another device, so it can't be changed here. Restore it from the Archive page first.",
      lost: "Saved. Open the event again from the calendar to change it further.",
    }[state];
    return frame(
      <>
        <p className="muted">{message}</p>
        <Link to={CALENDAR}>Back to the calendar</Link>
      </>,
    );
  }

  if (!values) return frame(<p className="muted">Loading…</p>);

  const series = isSeries();
  const changed = unsaved();
  const repeatChanged = JSON.stringify(values.repeat) !== JSON.stringify(saved.current?.repeat);

  return frame(
    <>
      <div className="editor cal-form">
        <div className="cal-form-bar">
          {back}
          {series && (
            <>
              <button disabled={!changed} onClick={discard}>
                Discard
              </button>
              <button className="cal-save" disabled={!changed} onClick={() => timesOk() && setAsking("save")}>
                Save
              </button>
            </>
          )}
        </div>
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
            <When value={values.start} allDay={values.allDay} onChange={(start) => edit(moveStart(values, start))} />
          </label>
          <label>
            {values.allDay ? "Last day" : "End"}
            <When value={values.end} allDay={values.allDay} onChange={(end) => edit({ ...values, end })} />
          </label>
        </div>
        {problem && <p className="error">{problem}</p>}
        <label className="cal-field">
          Show as
          <select value={values.showAs} onChange={(e) => edit({ ...values, showAs: e.target.value as ShowAs })}>
            {SHOW_AS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <RepeatField
          repeat={values.repeat}
          startDay={values.start.slice(0, 10)}
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

      {asking === "save" && (
        <ScopeDialog
          question="Save for which events?"
          noOnly={repeatChanged}
          onPick={(picked) => {
            setAsking(null);
            save(false, picked);
          }}
          onCancel={() => setAsking(null)}
        />
      )}
      {blocker.state === "blocked" && asking === null && (
        <div className="cal-backdrop">
          <div className="cal-dialog" role="dialog" aria-label="Unsaved changes">
            <p>Unsaved changes</p>
            <button onClick={() => (timesOk() ? setAsking("leave") : blocker.reset())}>Save</button>
            <button
              onClick={() => {
                discard();
                blocker.proceed();
              }}
            >
              Discard
            </button>
            <button onClick={() => blocker.reset()}>Keep editing</button>
          </div>
        </div>
      )}
      {asking === "leave" && (
        <ScopeDialog
          question="Save for which events?"
          noOnly={repeatChanged}
          onPick={(picked) => {
            setAsking(null);
            save(true, picked);
            blocker.proceed?.();
          }}
          onCancel={() => {
            setAsking(null);
            blocker.reset?.();
          }}
        />
      )}
      {asking === "archive" && (
        <ScopeDialog question="Archive which events?" onPick={archive} onCancel={() => setAsking(null)} />
      )}
    </>,
  );
}

type WhenProps = { value: string; allDay: boolean; onChange: (value: string) => void };

/**
 * A start or end: a date, plus a time from a list every 30 minutes. One date-time field would be
 * simpler, but the PC app's browser engine (WebKitGTK) only offers a date picker for it.
 */
function When({ value, allDay, onChange }: WhenProps) {
  if (allDay) return <input type="date" value={value} onChange={(e) => onChange(e.target.value)} />;
  const date = value.slice(0, 10);
  const time = value.slice(11, 16);
  return (
    <span className="cal-when">
      <input type="date" value={date} onChange={(e) => onChange(`${e.target.value}T${time}`)} />
      <select value={time} onChange={(e) => onChange(`${date}T${e.target.value}`)}>
        {timeChoices(time).map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </span>
  );
}

const FREQS: { value: Repeat["freq"]; label: string; unit: string }[] = [
  { value: "none", label: "Doesn't repeat", unit: "" },
  { value: "daily", label: "Every day", unit: "days" },
  { value: "weekly", label: "Every week", unit: "weeks" },
  { value: "monthly", label: "Every month (same date)", unit: "months" },
  { value: "yearly", label: "Every year", unit: "years" },
];

type RepeatProps = { repeat: Repeat | null; startDay: string; onChange: (repeat: Repeat) => void };

/** The repeat part of the form. A rule it can't show is left as it is. */
function RepeatField({ repeat, startDay, onChange }: RepeatProps) {
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
    <fieldset className="cal-repeat">
      <label>
        <span className="cal-label">Repeat</span>
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
