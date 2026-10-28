---
name: calendar-facts
description: Durable facts, invariants and open items of the calendar app, current state only — the gaps loop condenses closed items here
metadata:
  type: project
---

# Calendar app: facts, invariants, open items

How the app is, now. This file holds the current state only: no history, no dates, no
commits, no "used to"; when a fact changes it is rewritten in place. The `gaps-loop`
(`zai/gaps-loop/`) condenses every closed item here. Design decisions are in
`calendar-architecture.md`; platform knowledge is the `sobamail-app` skill's and is not
repeated here.

## Data model (`sobamail.com/module/calendar/v1.mjs`, tables in `Mutator.mjs`)

| table | insert event | key | notes |
|---|---|---|---|
| `event` | `AddEvent` | lww `uuid` | the entity |
| `event_attr_single` | `SetEventAttr` | lww `[event, key]` | `title`, `cal`, `start`, `end`, `allDay` (1/0), `location`, `desc`, `callUrl`, `call` (1/0), `tz`; an invitation's `uid`, `organizer`, `status`; `sequence` |
| `event_attr_multi` | `AddEventAttr` | lww `[event, key]` | container row for a list: `attendees` |
| `event_attr_multi_value` | `AddEventAttrValue` | none | one row per list item, composite fk to its container |
| `calendar` | `AddCalendar` | lww `uuid` | every calendar; the primary one's uuid is the instance id |
| `calendar_attr` | `SetCalendarAttr` | lww `[calendar, key]` | `name` (absent until the primary one is named), `color` (`#rrggbb`) |

Invariants:

- `start`/`end` are naive ISO `YYYY-MM-DDTHH:MM`, the wall clock of the event's `tz`
  ("" or absent: the browser's); `GetEvents` keeps the events overlapping `[from, to)`
  — `start < to AND end >= from`, as strings, in start order, so an event of another
  zone within ~a day of the window's edge can fall out (the window is padded by weeks).
  All-day events are stored as `T00:00` of their first day to `T23:59` of their last
  with `allDay=1`; the UI ignores those times and never converts them.
- Time zones: `PutEvent.tz` is "" or IANA-shaped (`ZONE`, shape only — else
  `MalformedObject`), written only when sent. The module's `parse_ics` keeps every wall
  clock as written with `tz` ("UTC" for `Z`, the IANA TZID, "" for floating/Windows
  names/dates; an end in another zone is moved into the start's), so nothing depends
  on the runtime's zone; `read_invitations` stores it. The store converts at its
  boundary (`dates.ts` `convertZone`, `localZone`; `setZone` pins it in tests): load
  tz → browser, save browser → the event's `tz` (new: browser's). Pinned by
  `dates.test.ts` "convertZone", `App.test.ts` "time zones".
- Multi-day events: the UI's `CalendarEvent`/`EventForm` carry `endDate`
  (= `dateOf(end)`, never before `date`); the form has Start/End date (moving the start
  keeps the span; end < start refused). `calendar.ts` `pieceOn(ev, date)` gives a
  `DayPiece` — times clipped to 0/24, `day`/`days` — and a timed event ending at 00:00
  takes nothing of that day; `store.eventsOn` returns pieces, so week/day draw one
  clipped block per day, month and all-day chips get `from-before`/`to-after` (flat
  joins), the agenda lists "Title (day N of M)" per day, the popover shows both ends.
  Pinned by the backend test's "multi-day events", `calendar.test.ts` "pieceOn",
  `App.test.ts` "multi-day events".
- Every fk cascades: deleting an event removes its attributes, deleting the
  `attendees` container removes its values.
- List values have no lww key, so `PutEvent` replaces a changed list through its
  container: read the current values with `soba.db.exec`, delete the container when
  the list differs, insert a new container and its values. An unchanged list is left
  alone: a byte-identical re-insert would collapse anyway.
- `PutEvent` writes every scalar attr unconditionally; lww ignores an insert whose
  digest matches the stored row, so unchanged fields cost nothing. There is no `base`
  snapshot (Contacts has one): a save from a stale view re-asserts old values for
  fields the user didn't touch.
- `DeleteEvent` checks the uuid exists with a query before `soba.data.find`: a find
  on a never-inserted key throws, and a throw from `process()` is retried.
- Request handlers read SQL through a `query()` helper that throws on a non-zero
  result code. `soba.db.exec` reads a per-pass snapshot: rows written earlier in the
  same pass don't show to it.
- Search: `GetEvents` lists the window's uuids in start order (no window: every event,
  by uuid), and with a `filter` reads their `title`/`location`/`desc` and guest values
  through `json_each` and keeps events where a `fold()`ed value (as in Contacts: NFKD,
  marks U+0300–U+036F dropped, lowercase, `ı`→`i`) contains the folded query — no SQL
  `LIKE`, no PRAGMA, `%`/`_` literal. `limit`/`offset` slice the hits in js; the reply
  keeps page order. The toolbar shows "N of M in view" (shown calendars) or "no
  matches in the shown months" and a "Clear search" button; Escape clears. Pinned by
  the backend test's "filter" block and `App.test.ts` "search".
- Calendars: every calendar is stored and an event's `cal` is a calendar uuid.
  - The primary calendar: one per instance, its uuid the instance id
    (`soba.app.instanceId()`: 26 base32hex digits, callable from request handlers) in
    the braced lowercase form `uuid.v4()` mints (`instance_uuid()`), which `calendar`'s
    uuid check accepts. Calendar uuids must be truly random, never known or derived
    values (calendars will talk to each other); the instance id is a random v4 yet the
    same on every replica, so replicas that create the calendar before they first sync
    write identical mutations instead of a calendar each. `primary_calendar()` creates
    it on first need (`GetCalendars`, a `PutEvent` with `cal` "", an invitation):
    `AddCalendar` and a `color` attr (`PRIMARY_COLOR`, the palette's blue), no `name`
    — the UI shows "(Calendar)" (`calendarName()` in `data.ts`). `GetCalendars` lists it
    from what it wrote, not from its query (the snapshot above). It is renamed and
    recolored like any other; `DeleteCalendar` refuses it (logs, `{deleted: 0,
    events: 0}`) and the UI offers no Delete for it.
  - `PutEvent` takes `cal` "" as the primary calendar and refuses (`MalformedObject`,
    in `write()`, nothing written) one naming no stored calendar; the form checks first
    ("Pick a calendar.") since a dropped request answers nothing. New events and
    imports default to the primary calendar (`store.primaryId`).
  - `PutCalendar` trims a non-blank name and takes a `#rrggbb` color (stored
    lowercase; the UI offers `PALETTE`, `deepOf` maps it); `GetCalendars` lists the
    primary one first (`Calendar.primary` 1), then by folded name (a `LEFT JOIN`, so a
    calendar without attrs is listed); `DeleteCalendar` answers `{deleted, events}`,
    refused while events name it. An event on a calendar deleted elsewhere shows gray
    as "Unknown calendar" and stays visible; visibility lives in `localStorage`
    `calendar.visible` (`{id: false}` per hidden calendar, garbled/refused storage
    shows all). Pinned by the backend test's "calendars" block, `invite-in.test.ts`
    "sent again" and `App.test.ts` "calendars".
- No boolean is ever persisted: the runtime throws `Boolean types are not supported`
  (`v8i-main.log`: then `Error converting to object`, `Unable to parse msgpack data`,
  `Error 578 processing mpdata: Invalid msgpack`). Booleans are fine in code; every
  flag in a row, a response or a UI request is 1/0: `PutEvent` keeps `allDay`/`call`
  as 1/0 from its constructor on, `Event`'s defaults are 0, `Calendar.primary` and
  `DeleteCalendarResponse.deleted` are 1/0, the store sends `allDay`/`call` as 1/0, and
  `Flag` is `0 | 1` in the d.ts. Whether the runtime also refuses one in a request is
  unverified; sending 1/0 makes it moot.
- Every declared column has text affinity, so a stored 1/0 reads back as "1"/"0", both
  truthy: `read_attr()` turns the `FLAGS` (`allDay`, `call`) and `sequence` back into
  numbers in `GetEvent`/`GetEvents`. Pinned by the backend test's "reads back as
  numbers…" and `App.test.ts` "keeps a new timed event timed".
- Response classes (`PutEventResponse`, `GetEventsResponse`, `Event`, `Calendar`,
  `PutCalendarResponse`, `GetCalendarsResponse`, `DeleteCalendarResponse`) are not in
  `static objects`, like Contacts'.
- Invitations in: the ICS parser lives in the module (`parse_ics` → `IcsEvent`s with
  naive `start`/`end` in their `tz`; `ui/src/lib/ics.ts`'s `parse_ics` adapts it to the
  browser's dates and hours). `objects` has `Message.KEY`; a `message` delivery that is
  not limbo and not a structured object goes to `read_invitations(message)`: own mail
  skipped; text/calendar / application/ics / *.ics attachments, else a VCALENDAR
  `bodyText`; METHOD:REQUEST only; each VEVENT through `PutEvent.write()` with `uid`,
  `organizer`, `status: "tentative"`, the same `uid` reusing its uuid and its `cal`
  while that calendar exists (else, and for a new one, the primary calendar).
  `PutEvent` writes those three only when sent, so UI saves keep them. The UI marks
  `status` "tentative" dashed + "Invitation:" (month chip: title only), the popover
  says "Invitation from <organizer>" and offers no Send invitations. Pinned by
  `lib/invite-in.test.ts`, `ics.test.ts` "the module's parse_ics", `App.test.ts`
  "received".
- Backend hygiene: every constructor throws the module's `MalformedObject` on content
  no retry can fix; `PutEvent` trims the title and refuses a blank one, a non-string
  `cal` or one naming no stored calendar, a start/end off `YYYY-MM-DDTHH:MM`,
  `end < start`, a `sequence` that isn't a whole number >= 0. `Mutator.process()`
  admits `task`/`task-replay` deliveries to the handlers and plain mail to
  `read_invitations` only, and logs and drops a `MalformedObject`. `GetEvent` on an
  unknown uuid throws the base module's `NotFoundError`, handed in by the Mutator as
  `ERRORS`. The replicated events have `asText`/`toString`.

## Module pin

`Mutator.mjs` imports the module with a base32hex `?sha224=` pin. After any change:
`sha224sum sobamail.com/module/calendar/v1.mjs | cut -d' ' -f1 | basenc --base16 -d | basenc --base32hex | tr -d '='`
(the allow-listed shape); it reproduces the committed pin.

## UI

- `ui/src/lib/model.ts` is the only path to `/api/v2/object`; it throws on a reply
  carrying the error key. The store (`store.svelte.ts`) serializes writes with a
  `saving` flag, guards `load()` and `search()` with sequence counters, and surfaces
  failures in `store.error` (a banner in `App.svelte`).
- The time grid spans 0–24 (`H0`/`H1` in `ui/src/lib/data.ts`) and scrolls to
  `SCROLL_HOUR` on mount; the form's time pickers cover every half hour. The week
  grid's header and all-day rows reserve the scroll area's scrollbar
  (`scrollbar-gutter: stable` on all three), so their columns line up with the
  grid's. Not testable in jsdom.
- `addMonths` clamps to the target month's length.
- Fonts: `tokens/fonts.css` loads Idealist Sans (`soba://app/fonts/`); no system fonts
  and nothing from the web. Idealist Sans covers every non-ASCII character the UI sets
  except ✎ and ＋, which are inline SVGs; it lacks only ĭĲĳŊŋŦŧ of Latin Extended-A
  (user text with those falls back).
- Event form: description, guests (one address per row, `ui/src/lib/email.ts` as in
  Contacts plus `call_url_ok`; Save disabled on a bad row, blanks dropped) and a video
  call link. `PutEvent` stores `callUrl` (trimmed, "" or http(s) with a host, else
  `MalformedObject`) as a single attr and derives `call` from it, ignoring a sent
  `call`; a stored `call=1` row without a link shows a disabled Join until it is saved
  again. The popover's Join is an `<a target="_blank" rel="noopener noreferrer">`.
  Pinned by `App.test.ts` and the "call link" block of the backend test.
- Direct manipulation: a click on a day column opens the form at the half hour under
  the pointer (`slotAt` in `calendar.ts`, `openCreate(date, hour?)`), on a month cell
  at that day 10–11; event chips and the day number stop propagation; "+N more" is a
  button to the day. Dialogs: `lib/dialog.ts` `dialogFocus` moves focus in
  (`[data-autofocus]`) and back, Escape closes (`<svelte:window>`), the overlay closes
  only on itself. Delete asks "Delete '<title>'?" (focused Confirm; Escape takes it
  back). Pinned by `App.test.ts` and `calendar.test.ts` "slotAt".
- Dragging: in the week/day grid an event follows the pointer in whole days (the
  column under it, `columnAt`) and quarter hours (`moved()` in `calendar.ts`: the start
  snaps to :00/:15/:30/:45 on the grid, the length is kept, a one-day event stays
  within its day — ending at midnight at the latest — and an all-day chip moves by
  days in its lane). The store's `moving` puts the event at its snapped place in
  `visible` while dragging, so it renders there for real (the grabbed block is
  re-created in the new column, so the pointer is followed on `window`); the release
  saves through `PutEvent` (`dragDrop`, shown in place meanwhile, the reload confirms
  or puts it back); Escape or pointercancel put it back. A press moving under 4px
  stays a click; the click a drag's release makes is swallowed on window, capture
  phase. A move with the primary button up (`buttons & 1` is 0: released where the
  grid didn't see it) cancels the drag; once a drag starts, the grid's root takes
  pointer capture, so a release outside the window still arrives (not on press, or a
  plain click wouldn't reach the block). Pinned by `calendar.test.ts`
  "moved"/"columnAt" and `App.test.ts` "dragging in the week view" (jsdom has no
  layout: the tests stub the columns' rects).
- Resizing: a 6px handle on the bottom edge of the block that holds the event's end
  (`day === days`) drags the end only, vertically (`resized()`: snapped to the quarter
  hour, a quarter hour after the start and into the end's day at least, midnight at
  the latest; an event ending at midnight is taken as ending the day before). Same
  press handling and save as dragging (`store.resizeTo`); the handle's pointerdown
  stops propagation so the block doesn't take the press too. There is no top-edge
  handle. `layoutDay` is generic so the grid keeps the pieces' `day`/`days` types.
  Pinned by `calendar.test.ts` "resized" and the "dragging in the week view" block.
- Telling the guests: a drag or resize of an event with guests isn't saved on release.
  It stays where it was dropped and `store.pendingMove` opens `MoveDialog.svelte`
  ("Tell the guests?", what it moves to by `whenText()`): "Put it back", Escape or the
  overlay undo it, saving and sending nothing; "Send update" saves it with `sequence`
  raised by one, then mails the guests an "Updated invitation: <title>"
  (METHOD:REQUEST, same UID, the raised SEQUENCE) and opens the popover with "Update
  sent to N guests.". It is saved before it is mailed, so a failed save never tells
  guests a time that didn't stick. An event without guests saves on release. Pinned by
  `App.test.ts` "an event with guests" (its drops fire the release's click, which the
  grid swallows, as a browser does).
- An event organized by someone else can't be dragged or resized: only its organizer
  reschedules it. `store.movable(id)` is false for one with an `organizer` or
  `invitation`; the grid starts no drag on it (a press stays a click) and gives it no
  resize handle, and `dragTo`/`resizeTo`/`dragDrop` refuse it too. The edit form still
  offers its date and times. Pinned by `App.test.ts` "an event organized by someone
  else".
- iCalendar: `lib/ics.ts` `write_ics(events, {method, organizer, now})` writes timed
  events in their `tz` (`;TZID=<tz>`, `Z` for UTC, floating without one; no
  VTIMEZONE), date-only all-day events with an exclusive DTEND, the event's `sequence`
  as SEQUENCE, escaping, 75-octet folding; `parse_ics` → `ImportedEvent`s (with
  `uid`/`organizer`/`status`/`sequence`/`tz`): `Z` and IANA TZIDs converted to the
  browser's zone, unknown TZID (Outlook's Windows names) kept as written, DURATION,
  midnight end → 23:59 the day before, CANCELLED skipped, RRULE not read. Toolbar
  Export (the shown months) and the popover's Export download a Blob; Import (picker →
  `ImportDialog.svelte`, ticks, a calendar, one `PutEvent` each, untitled → "(No
  title)", no duplicate check). Pinned by `ics.test.ts` and `App.test.ts` "export and
  import".
- Invitations out: module `SendInvite {uuid, to, ics, subject, text}` (refuses a
  missing uuid/address/ics) mails the UI's ICS from `soba.app.account()` as
  `invite.ics`, type `text/calendar; method=REQUEST`, bytes
  `soba.text.encode(ics).buffer`, with the base `Message`/`MessageAttachment` handed
  in by the Mutator as `MAIL`; `GetAccount` → `Account {address}` gives the ORGANIZER
  (asked once per store). The popover of an event with guests has "Send invitations"
  and a status line; saving an event with guests opens its popover saying the guests
  haven't been told. Every send writes the event's `sequence` attr as SEQUENCE:
  `PutEvent` writes it only when sent, a whole number >= 0; it is 0 until an update is
  mailed, which raises it so clients take the mail for an update. Pinned by
  `lib/invite.test.ts`, `App.test.ts` "invitations", the backend test's "sequence" and
  `ics.test.ts`.
- Views and chrome: the agenda lists `agendaSpan(cursor)` (`dates.ts`: the cursor's
  week start to `loadWindow`'s `to` less a day — the last loaded day; `to` is
  exclusive, an event starting on it is not read), clipping multi-day events to it;
  the toolbar labels it `agendaRangeLabel` ("Oct 12 → Nov 29, 2026") and the list ends
  on an "Agenda edge" note naming both ends. `store.capped` (a load returned `PAGE` =
  1000 rows) shows an "Event limit" status under the toolbar. There is no title bar:
  the toolbar is the app's top row. Pinned by `dates.test.ts` "the agenda span" and
  `App.test.ts` "views and chrome".
- Locale: `lib/locale.ts` builds `Intl.DateTimeFormat`s once for `navigator.language`
  (`setLocale(lang?, first?)` rebuilds them); `dates.ts`'s labels,
  `weekdayHeaders("short"|"narrow")` (month grid, mini month) and `calendar.ts` `fmt`
  (grid, form time options, popover, invite text) go through it. The week starts on
  `Intl.Locale` `weekInfo.firstDay` (`getWeekInfo()` on newer engines), Monday when
  absent; `weekdayIndex`/`startOfWeek`/`loadWindow` follow it. Ranges use
  `formatRangeToParts` (agenda swaps the separator for " → "); U+2009/U+202F become
  plain spaces. Storage and `ymd` are untouched. Pinned by `lib/locale.test.ts`.
- Realtime: the store holds one `EventSource` on `/api/v2/event`, the runtime's app
  event stream (amp-mgui `doc/pub/ref/app-events.md`), which announces every mutation
  of the instance under its object key — this page's, another page's, a peer
  replica's. The event tables' insert keys (`AddEvent`, `SetEventAttr`,
  `AddEventAttr`, `AddEventAttrValue`) reread the window (`load()`), the calendar
  tables' (`AddCalendar`, `SetCalendarAttr`) the calendars, and base `DeleteRow`
  (it doesn't say which table) and the stream's `open` both. A burst (a batch arrives
  as consecutive events) is one reread, 50ms after its first event. A reread keeps a
  `pendingMove` drop where it was dropped. The writes' own explicit reloads stay:
  `save()` needs the reloaded event before it opens the popover. No `EventSource`
  (jsdom) means no stream. Pinned by `App.test.ts` "realtime updates", with a stand-in
  `EventSource`.
- svelte-check: 0 errors, 0 warnings.

## Tests

`pnpm -C ui run test` (vitest). `ui/src/test/soba.ts` is a stand-in runtime ported
from Contacts: sql.js with the Mutator's tables mirrored by hand (keep them in sync),
every declared column with text affinity like the runtime's; `soba.data.*` emulating
lww, the find-key rule and fk cascades; inside `run()`, `soba.db.exec` reads a copy
taken when the pass began (sql.js `export()` resets pragmas, so `foreign_keys` is
turned back on), outside it (`read_invitations` called directly) it reads live;
`refuse_booleans` throws on a boolean in `soba.data.insert` and `soba.task.respond`;
`soba.app.instanceId()` answers `INSTANCE_ID`, whose braced uuid is `PRIMARY`;
`warnings` records `soba.log.warning`, `sent` records `soba.mail.send`. `soba.ts` also
exports stand-in base-module classes for what the Mutator hands in (`NotFoundError`
as `ERRORS`; `FakeMessage`, `FakeAttachment` as `MAIL`). `ui/src/test/backend.ts` is
the fetch stub for jsdom UI tests; it refuses a request carrying a boolean, passes
`{...ERRORS, ...MAIL}` to every request and answers a throw with reply key 2. Files:
`test/harness.test.ts`, `lib/dates.test.ts`, `lib/calendar.test.ts` (`fmt(24)` is
"12 AM"), `lib/model.test.ts`, `lib/calendar-backend.test.ts`, `lib/email.test.ts`,
`lib/ics.test.ts`, `lib/invite.test.ts`, `lib/invite-in.test.ts`,
`lib/locale.test.ts`, and the jsdom flow `App.test.ts` (renders the whole App against
the fetch stub; drive it with `userEvent`, find dialogs by role + name; pointer moves
of a drag carry `buttons: 1`). Every file starts from `test/setup.ts` (vitest
`setupFiles`): `setLocale("en-US", 1)` — English names, 12-hour clock, Monday start —
so expectations hold on any machine's locale. `pnpm -C ui run test -- <file>` runs the
WHOLE suite (vitest gets the `--`), and `pnpm -C ui exec vitest …` is denied: one-file
runs aren't available headless.

## UNVERIFIED against the runtime (the owner's shakedown list)

- Attendee replacement through the container: reasoned from the lww rules and
  Contacts' identical pattern, not run.
- `DeleteEvent`'s query-then-find guard: same.
- That the runtime's V8 has full ICU for `String.prototype.normalize("NFKD")` in
  `fold()`; Contacts relies on the same call.
- `Mutator.mjs`'s `process()`: the `task`/`task-replay` delivery gate and the
  `MalformedObject` log-and-drop; vitest can't import the Mutator
  (`soba://computer/R2`, the pinned base module), so only the module's constructors
  are tested.
- How the runtime answers a request whose handler throws (`GetEvent` →
  `NotFoundError`): the fetch stub assumes reply key 2 holding the message, which
  `model.ts`'s `decode` turns into a thrown Error; and whether such a throw from a task
  is retried like any other.
- That `localStorage` persists across app reloads in the CEF host (calendar
  visibility); jsdom only proves the read/write and the try/catch fallback.
- The primary calendar across replicas: that `soba.app.instanceId()` is the same on
  every replica of a private instance, and that two replicas creating it before their
  first sync write mutations that collapse into one (content addressing). The
  stand-in models no replication, and one device can't show it.
- The app event stream in the CEF host: that an AddEvent replicated in from a peer
  reaches the page and the window rereads; jsdom only proves the listeners.
- Whether the CEF host opens the popover's `<a target="_blank">` Join link in a browser
  or a new window, or swallows it; jsdom only proves the attributes.
- Export: a `blob:` download is cancelled inside Sobamail (contacts facts "vCard
  export"), so it works in a plain browser only; and whether CEF shows the Import file
  picker (`<input type="file">`), as Contacts' Import also assumes.
- `SendInvite`: the real send, that the runtime keeps the `; method=REQUEST` parameter
  of the attachment type (it is passed whole as `type`), and how mail clients (Gmail,
  Outlook, Thunderbird) present the invitation, and whether they apply an update whose
  SEQUENCE was raised.
- The mail path, all of it: that `Message.KEY` in `objects` delivers plain mail as
  `metadata.type` "message"; that `extractObject` is null for it; the shape of a
  received attachment (assumed `{name, type, blobs}` with ArrayBuffer/view/string
  blobs, like the sending side; a `Blob` object would read as ""); that
  `soba.data.insert` from a mail delivery's handler persists as from a task.
- Zones: whether the runtime's V8 `Intl` knows IANA zones — only an end written in
  another zone than its start needs it, and falls back to the wall clock as written;
  whether CEF reports the user's zone in `resolvedOptions().timeZone`; and whether
  Gmail, Outlook and Thunderbird take a bare IANA TZID without a VTIMEZONE (RFC 5545
  asks for one).
- A re-sent invitation overwrites the user's edits to that event: `read_invitations`
  doesn't store or compare the incoming SEQUENCE. METHOD:CANCEL is ignored (replies and
  cancellations are out of scope, `calendar-gaps.md` §R).
- Locale in CEF: which `navigator.language` the host reports (the OS locale or
  Sobamail's own), and that its Chrome 117 ICU has `weekInfo`; Node's ICU proved
  tr-TR/en-US only.

## Lessons

- Sobamail Desktop (Chrome 117) serves DevTools on `127.0.0.1:50134`. The sobamail-app
  skill's `scripts/devtools/` read an app's page (`pages`, `shot`, `query`, `console`,
  `network`, which decodes the object API's msgpack) and act on it (`eval`, `input`,
  `reload`); see its `references/devtools.md`. The project's settings allow the first
  group and ask for the second. Learn the app's instance id first: `pages.mjs` reads it
  out of the page URL `soba://app/<appid>/<account>/<instid>`; every other script takes
  it, never a title. Here it is `O28HT95J352IJ2AV3K1KGTBGCO` on `devel@soba.email`;
  with `v8i-main.log` and `mutlog.py` on the dev profile
  (`~/.local/share/Soba/Mail_devel/m-J0XBVZ`) that covers both ends of the app.
- A `cd … && git …` chain is denied under `dontAsk`; a standalone `cd` is fine and the
  cwd persists to the next call.
- `cat >> file <<EOF` and `sed -i` are denied too: append and delete doc/test text
  with the Edit tool.
- `clang-format <file>` is denied too: format the module by hand.
- user-event's `upload` honours the input's `accept`: a test file whose name or type
  doesn't match is silently dropped and no change event fires.
- Reads and commands outside the session's allowed roots (`util/`, a sibling not added
  with `--add-dir`) are denied silently in headless passes.
