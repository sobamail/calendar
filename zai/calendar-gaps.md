---
name: calendar-gaps
description: Plan of record for the gaps loop — the 2026-10-14 assessment of what the calendar lacks as an email platform's calendar, the distilled fixes, and what was rejected
metadata:
  type: project
---

# Calendar gaps: plan of record

The assessment of 2026-10-14 (a full read of the backend module, the Mutator, the
store, the model, the date helpers and every component, compared against
soba-contacts) found three kinds of shortfall: bugs, inconsistencies with the
platform and with Contacts, and gaps for a calendar that lives inside an email
platform. The bugs were fixed the same day (commits cfd72a4, 997bdb7, 6d03821,
6c7aead; the facts are in `calendar-facts.md`). This document governs the rest: the
`gaps-loop` (`zai/gaps-loop/`) works the sections below as items. Every code
location here is a hypothesis — the tree moves; re-measure before acting.

Owner context: the calendar is "the calendaring interface of an email platform"
(owner, 2026-10-14). Contacts is the reference for every idiom (its `zai/contacts-facts.md`
is the measured truth about the runtime). The `sobamail-app` skill is the platform
reference and is never restated here.

## §1 Test harness

The calendar has no tests at all. Contacts has vitest with a stand-in runtime
(`ui/src/test/soba.ts`: sql.js in-memory SQLite, the Mutator's tables mirrored by
hand, `soba.data.*` emulating lww and fk cascades) and a fetch stub
(`ui/src/test/backend.ts`) that runs module request objects and answers in compact
SMC, so UI, model and module are tested together. Port that harness, then pin the
date arithmetic (`ui/src/lib/dates.ts`: `addMonths` clamping, `loadWindow`,
`isoAt`/`hourOf` round trips), `fmt` and `layoutDay` (`ui/src/lib/calendar.ts`), the
model's error-key handling, and the backend's `PutEvent`/`GetEvents`/`DeleteEvent`
on the stand-in. Everything later in this plan is test-first on this harness.

## §2 Backend hygiene

`PutEvent` validates nothing: empty title, end before start, malformed ISO, unknown
calendar are all accepted (Contacts refuses an empty person and throws
`MalformedObject` from constructors, which `process()` logs and drops rather than
retrying forever). `process()` in `Mutator.mjs` accepts every delivery type; Contacts
gates on `metadata.type` (`task`, `task-replay`), which is also what keeps a mailed
structured object from writing to the store. `GetEvent` answers an unknown uuid with
an empty event instead of `NotFoundError`. `read_event` in `model.ts` is unused.
`v1.d.ts` declares a `DeleteEventResponse` that nothing sends and types `allDay`/`call`
as booleans while the wire carries 0/1. Replicated events lack `asText`/`toString`.
Distilled: constructor validation with a `MalformedObject`, a delivery gate shaped
like Contacts' (to be widened by §10 for mail), `NotFoundError` on `GetEvent`, the
d.ts made truthful, the dead model call removed.

## §3 Event form completeness

The form edits title, calendar, date, times, all-day and location; description,
guests and the call flag are preserved but not editable, and the popover's "Join
video call" is a no-op with no URL anywhere (`EventPopover.svelte`). Distilled: a
description textarea; a guests field taking email addresses (validated like
Contacts' `ui/src/lib/email.ts`, shown with `Avatar`), stored in the existing
`attendees` multi attr; a call link stored under a new single attr `callUrl` (the
0/1 `call` flag becomes derived: set when `callUrl` is non-empty, kept for stored
rows), and "Join" opening that URL. Guests as addresses are what §9 mails to.

## §4 Direct manipulation and dialogs

Clicking an empty time slot or an empty month cell does nothing; the create form
always defaults to 10–11 on the cursor day. Delete has no confirmation and no undo.
Dialogs don't trap focus or close on Escape (`EventForm.svelte`, `EventPopover.svelte`;
svelte-check reports four a11y warnings on them). "+N more" in a month cell is inert.
Distilled: click-to-create at the clicked half hour (week/day) or day (month);
a confirm step on Delete; Escape closes, focus moves into the dialog and returns;
"+N more" opens the day. Drag to move/resize is OUT (§R).

## §5 Search

Server-side `LIKE` under `PRAGMA case_sensitive_like=0` folds ASCII only; `%` and `_`
in the query are unescaped wildcards; the search is silently scoped to the loaded
window; there is no match count and no "nothing matches" state. Contacts folds in
JavaScript (NFKD, strip U+0300–U+036F, lowercase, `ı`→`i`) over the rows it read.
Distilled: `GetEvents` with a filter reads the window and folds in JS like Contacts
(the PRAGMA goes), the toolbar shows "N of M in view" and a hint that search covers
the shown months, Escape clears.

## §6 Calendars

Four calendars are hard-coded (`CalendarId` union, `CALENDARS` in `ui/src/lib/data.ts`);
"Add calendar" in the sidebar opens the new-event form; an event whose `cal` isn't
one of the four is silently invisible (`visible` in the store); visibility toggles
reset on reload. Distilled: a `calendar` entity table (uuid) with a `calendar_attr`
table (name, color) following the event tables' shape, holding user-created
calendars only; the four present ids stay built in (always listed, never stored),
so stored events keep their calendar without a migration; create/rename/recolor in
the sidebar, unknown ids rendered with a neutral color, visibility remembered in
`localStorage`.

## §7 Multi-day events

The model is single-day: `start` and `end` carry the same date, the form has one
date, `GetEvents` filters on `start` only, and `eventsOn` keys by the start date.
Distilled: an end date in the form (all-day spans most often), the window filter
taking `end >= from` into account, and rendering as a span: chips across the month
cells and the all-day lane, one block per day in week view, one agenda line per day.

## §8 iCalendar library

No import/export exists. Contacts' `ui/src/lib/vcard.ts` is the precedent: a pure
writer and parser with tests. Distilled: `ui/src/lib/ics.ts` writing and parsing
RFC 5545 VEVENT (UID, DTSTART/DTEND with the date-only form for all-day, SUMMARY,
LOCATION, DESCRIPTION, ATTENDEE mailto, ORGANIZER, URL for the call link, METHOD at
the VCALENDAR level), CRLF and 75-octet folding, escaping; Export (the window or one
event) and Import (file picker, list, tick, `PutEvent` each) in the toolbar, modeled
on Contacts' dialogs. Recording: `blob:` downloads are cancelled inside Sobamail
(contacts facts), so export works in a plain browser only until the host adds
download support — the button stays, like Contacts'.

## §9 Invitations out

Guests are never told. Contacts' `SendVCard` is the precedent: a request object
that mails an attachment built by the UI, with the base module's `Message` and
`MessageAttachment` handed in from the Mutator (`MAIL`), from `soba.app.account()`.
Distilled: `SendInvite {uuid, to[], ics, subject, text}` mailing a `text/calendar;
method=REQUEST` attachment (and the same text inline) to the guests; the UI offers
"Send invitations" on an event with guests and after saving one; the organizer is
the account. Follows §3 and §8.

## §10 Invitations in

The app subscribes to no mail at all (`Mutator.mjs` `objects` has no `Message.KEY`),
so an invitation arriving by email never reaches it. Distilled: subscribe to
`Message.KEY`, accept `metadata.type` `"message"` for it (§2's gate widened for
this one key), find a `text/calendar` attachment or body, parse with §8, and emit a
`PutEvent`-shaped write with new single attrs `uid` (the iCalendar UID, so a
re-sent update replaces rather than duplicates), `organizer` and `status`
(`tentative`); such events render with a dashed border and an "Invitation" label.
Replies (accept/decline) are OUT for this loop (§R). The mail path cannot be
exercised headlessly: the parsing is tested, the delivery is UNVERIFIED until the
owner's shakedown.

## §11 Views and chrome

The Agenda header shows one week's range while the list runs to the window's end
with no edge marker; the 1000-event page cap is silent; the title bar carries fake
traffic lights and the sidebar a static "Synced just now". Distilled: the Agenda
label states the span shown ("This week → end of November") and the list ends on
an "earlier/later" edge line; a "showing the first 1000" notice when the page is
full; the traffic lights and the fake status go.

## §12 Locale

English month and weekday names, a 12-hour clock and a Monday week start are
hard-coded (`ui/src/lib/dates.ts`, `fmt`). Distilled: `Intl.DateTimeFormat` with
`navigator.language` for names and hour cycle, `Intl.Locale.weekInfo` where present
(Chrome 117 has it) for the first day of the week, Monday as the fallback; the
stored format is untouched.

## §13 Time zone

Storage is local-naive wall-clock ("2026-07-08T09:30", no offset). An event created
in one zone shows at the same clock time in another; §8/§9 need a real instant for
DTSTART. Options: (a) keep naive storage, treat every value as the browser's zone
and write ICS with the browser's TZID (cheapest, wrong across zones); (b) add a
single attr `tz` (IANA name) written at creation, interpret naive values in it,
convert on display, use it as TZID. The sign-off queue decides.

## §R Considered and REJECTED for this loop — QUEUED for the next one

Owner's verdict on S6 (2026-10-15): "all stay out of this loop, but queue
them for the next one." This list is therefore the seed of the follow-up
loop, to be scaffolded once `GAPS-LOOP-COMPLETE` lands. Passes of THIS
loop still never act on it.

- Recurrence (RRULE expansion, exceptions): a loop of its own once §8 exists.
- Reminders and notifications: the backend has no timers; the host owns
  notifications.
- Drag to move or resize events: after click-to-create (§4) proves the geometry.
- Dark mode: the token files are shared across apps; not a calendar decision.
- Free/busy and scheduling assistant: needs cross-mailbox data the platform has
  no channel for.
- RSVP replies to inbound invitations: after §10 is verified against the runtime.
- Linking guests to Contacts entries: no data sharing between instances yet.
- Paging beyond 1000 events per window: a notice suffices for a personal calendar.
