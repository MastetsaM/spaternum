# Calendar UI: FullCalendar v7, repeats with rrule-temporal

Decided 2026-10-29 in conversation with Mihail. Spec: [[calendar_spec]].

## Decision
- The calendar views come from **FullCalendar v7** (`@fullcalendar/react`, MIT, free tier only).
- Repeating events are expanded with **rrule-temporal** (MIT), fed to FullCalendar as plain events for the dates on screen. About 20 lines of our own code.
- Not used: FullCalendar's `@fullcalendar/rrule` plugin, which needs the `rrule` package.

## Why
- **All the views in the free package.** Year (`multiMonthYear`), month, week and day with a 15/30-minute `slotDuration`, plus drag to move and resize. The paid tier only adds timeline/resource views, which a single-user app doesn't need.
- **Small attack surface.** `@fullcalendar/react` 7.1.3 depends on two packages from the same project (`@fullcalendar/core`, `@full-ui/headless-calendar`) and on `temporal-polyfill`. Fewer packages means fewer that can be hijacked or abandoned.
- **Maintained and funded.** Around for 15+ years, regular releases (7.1.3 on 2026-10-16), and the paid tier pays the maintainers.
- **v7 renders with real React** (v6 used Preact inside). Event titles go through React, which escapes text, so a title can't inject HTML.
- **rrule-temporal over rrule:** `rrule` 2.8.1 was last published in November 2023 and has known time-zone and summer-time bugs. `rrule-temporal` was released 2026-10-01, has 1 dependency, implements RFC 5545 fully, and uses the same Temporal dates as FullCalendar v7.

## Alternatives considered
| Library | Why not |
|---|---|
| **Schedule-X 4** | No year view found; drag/resize moved to the paid tier in v4 |
| **react-big-calendar 1.20** | No year view; 16 dependencies, including `moment`, `lodash` and `globalize` |
| **vkurko Event Calendar 5.18** | Only a year *list*, not a year grid; built on Svelte, no React wrapper |
| **Building from scratch** | Week grid with drag, resize, touch and overlapping events is weeks of work for no gain |
| **FullCalendar `@fullcalendar/rrule`** | Zero glue code, but relies on the stale `rrule` package |
| **FullCalendar v6** | Older and more proven, but uses Preact inside React; kept as a fallback if v7 causes trouble |

## Security notes
- Both libraries run only in the client and make no network calls. Data goes through our own API (Tailscale + token, [[2026-10-20-auth-tailscale-api-token]]).
- Custom event rendering must never use `dangerouslySetInnerHTML`.
- Exact versions pinned and logged in `wiki/installed.md`; lockfile committed; pnpm blocks install scripts by default.

## Consequences
- Easier: the views, drag and touch come for free; the stored `RRULE` text is the standard format, so a later `.ics` export or a switch of library doesn't change the data.
- Harder: v7 is recent (7.0.0 on 2026-06-19), so it has had less real-world use than v6. `rrule-temporal` has a single maintainer. Because it reads a standard format, replacing it means changing only the expansion code.
- Our own code handles the "only this one / this and following / all" logic, which neither library provides.

## Related
[[calendar_spec]] · [[TECH]] · [[2026-10-21-sync-rxdb]] · [[2026-10-20-auth-tailscale-api-token]] · [[PRD]]
