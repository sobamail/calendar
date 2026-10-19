---
name: calendar-architecture
description: How soba-calendar is structured — design import wired to a soba-contacts-style backend
metadata:
  type: project
---

soba-calendar = the claude.ai design `d2803e69` ("Sobamail calendar app design", a frontend-only Svelte demo in its `svelte-app/`) wired to a real Sobamail backend modeled 1:1 on `../soba-contacts` idioms.

Key decisions (non-obvious):
- **Storage/wire format is naive ISO** `start`/`end` datetimes (`"2026-07-08T09:30"`, never Z/offset), the wall clock of the event's `tz` attr ("" = the browser's zone; the store converts to and from the browser's zone). Backend `Event` (sobamail.com/module/calendar/v1.mjs) uses the entity + attribute tables layout: `event`, `event_attr_single`, `event_attr_multi`/`_value`. Flags (`allDay`, `call`) are stored as 1/0.
- **The UI keeps an ergonomic view-model** — `CalendarEvent` has `date`/`endDate` `"YYYY-MM-DD"` + fractional-hour `s`/`e` for grid math — decoded from/encoded to ISO at the `ui/src/lib/store.svelte.ts` boundary (`dateOf`/`hourOf`/`isoAt` in `dates.ts`). So components never see ISO; only the store + model do.
- **Server-side date filtering:** `GetEvents` takes `{from, to, filter, limit, offset}` and keeps the events overlapping `[from, to)` (`start < to AND end >= from`, ISO sorting chronologically as plain strings). `CalendarStore.load()` fetches a ±~1-month window (`loadWindow(cursor)`: from the week of the previous month's 1st to the week of the 1st two months on) and **reloads on every navigation** (cursor change) and after writes.
- Date/navigation core is `ui/src/lib/dates.ts` (local-tz helpers — never toISOString). `CalendarStore` holds a `cursor: Date` anchor + live `now` (ticks each minute); `goPrev/goNext/goToday/goToDay/shiftCursor/setMonth` move it by day/week/month per active view. `eventsOn("YYYY-MM-DD")` is the per-day lookup used by every view.
- **Search mirrors soba-contacts:** a server-side `filter` on `GetEvents`, matched in JS on folded text (NFKD, combining marks dropped, lowercase, `ı`→`i`), over `title`/`location`/`desc`/`attendees` only. The UI never hides results: it loads the window unfiltered, runs a second filtered read for the same window, and **dims** events whose uuid isn't in `store.matches` (`isDimmed`). `search()` uses a sequence counter, so a stale keystroke's response is dropped.
- **All-day events are stored as the span `T00:00`–`T23:59`** of their days (`ALL_DAY_SPAN` in the store), with `allDay=1`; the UI ignores those times and the edit form offers 10–11 as the fallback when the user unticks "All day". The time grid covers 0–24 (`H0`/`H1` in `data.ts`) and scrolls to `SCROLL_HOUR` (7) on mount, so any stored time renders inside the grid.
- **Writes are serialized in the UI** (`saving` flag disables Add/Save/Delete while a request is in flight) and `load()` carries a sequence counter like `search()`, so a slow reply from an earlier window can't overwrite the current one. Backend failures surface in `store.error` (banner in `App.svelte`), not just the console.
- **A fresh account starts empty** of events: no demo data; only the primary calendar is created on first need. `id` in the UI == backend `uuid`. Backend/UI boundary is `ui/src/lib/model.ts`, a port of the contacts model.ts.

**Why:** faithful to the imported design's look while being a genuine, persistent, date-aware Sobamail app with standard ISO storage + server-side windowed reads.
**How to apply:** multi-day events render as spans (`calendar-facts.md`). Naive ISO = the wall clock of the event's `tz`; the user sees it converted to the browser's zone. `event_attr_single.value` for `key='start'` is unindexed — fine for a personal calendar.
