# Gaps loop items

Working state only — an item's section is DELETED when it closes
(ground rules, growth upkeep); durable output goes to
`zai/calendar-facts.md`. The plan of record is `zai/calendar-gaps.md`
— every claim and line number there and here is a hypothesis;
re-measure before acting. `<CONTACTS>` = `/home/plq/src/arskom/amp/soba-contacts`.

## Order

ARMED 2026-10-15 (S1–S7 all verdicted below). G1 CLOSED 2026-10-15
(facts doc "Tests"); G2 CLOSED 2026-10-15 (facts doc "Data model", "Backend
hygiene"); G3 CLOSED 2026-10-15 (facts doc "UI", "Event form"); G4 CLOSED
2026-10-15 (facts doc "UI", "Direct manipulation"); G5 CLOSED 2026-10-15
(facts doc "Data model", "Search"); G6 CLOSED 2026-10-15 (facts doc "Data
model", "Calendars"); G7 CLOSED 2026-10-15 (facts doc "Data model",
"Multi-day events"); G8 CLOSED 2026-10-15 (facts doc "UI", "iCalendar"); G9 CLOSED
2026-10-15 (facts doc "UI", "Invitations out"); G10 CLOSED 2026-10-15 (facts doc
"Data model", "Invitations in"); G11 CLOSED 2026-10-15 (facts doc "UI", "Views and
chrome"); G12 CLOSED 2026-10-15 (facts doc "UI", "Locale"); G13 CLOSED 2026-10-15
(facts doc "Data model", "Time zone"). Every item is closed: the loop is COMPLETE
(the index carries the completion token). The plan of record's §R is the seed list
of the next loop (S6).

## Sign-off queue (all verdicted by the owner on 2026-10-15; the loop is armed)

### S1 — Dependency installs (VERDICTED)

- CONTEXT: G1 needs vitest and friends; `pnpm add` needs the network.
  Contacts' `ui/package.json` has them: `vitest ^5.0.4`, `jsdom ^30.1.2`,
  `@testing-library/svelte ^5.4.2`, `@testing-library/user-event ^14.6.7`,
  `sql.js ^1.14.2`, `@types/sql.js ^1.4.11`.
- OPTIONS: (a) passes may run `pnpm -C ui add -D` for exactly that
  list, matching Contacts' ranges, committing `package.json` +
  `pnpm-lock.yaml`; any other package parks. (b) the owner installs
  them before arming; passes never run `pnpm add`.
- VERDICT (owner, 2026-10-15): (a) — "Passes install that exact list."
  Only those six packages at Contacts' ranges; any other package parks.

### S2 — Schema changes (VERDICTED)

- CONTEXT: G3, G6, G10, G13 add attr keys (`callUrl`, `uid`,
  `organizer`, `status`, `tz`) and G6 adds two tables. Existing columns
  are never altered; the runtime creates missing tables on init and
  never alters one. `Mutator.mjs`'s `version` must grow at deploy.
- OPTIONS: (a) new attr keys free, new tables free, version untouched
  by passes (owner bumps at deploy). (b) new attr keys free, a new
  table parks per occurrence. (c) all schema changes park.
- VERDICT (owner, 2026-10-15): (a) — "New attr keys and new tables
  free"; the version is untouched by passes, the owner bumps it at
  deploy.

### S3 — Mail: sending invitations and accepting mailed ones (VERDICTED)

- CONTEXT: G9 sends mail from the app as the account (like
  `SendVCard`); G10 subscribes to `Message.KEY` and accepts
  `metadata.type === "message"` for plain mail, which Contacts refuses
  on principle. Neither can be verified headlessly.
- OPTIONS: (a) both approved; the delivery gate accepts plain
  `Message` only, never a mailed structured object. (b) G9 only.
  (c) neither — G9 and G10 move to §R.
- VERDICT (owner, 2026-10-15): (a) — "Both approved." The delivery
  gate accepts a plain `Message` only, never a mailed structured
  object; G10's delivery stays UNVERIFIED until the owner's shakedown.

### S4 — Time zone model (VERDICTED)

- CONTEXT: plan §13.
- OPTIONS: (a) keep naive storage as the browser's zone; ICS carries
  the browser TZID. (b) add a `tz` attr per event; convert on display.
- VERDICT (owner, 2026-10-15): (b) — "Add a per-event tz attr." G13 is
  a FIX; G8 uses `tz` as the TZID.

### S5 — Chrome removal (VERDICTED)

- CONTEXT: the fake macOS traffic lights in the title bar and the
  static "Synced just now" row come from the imported design.
- OPTIONS: (a) remove both (G11). (b) keep the title bar, remove the
  status row. (c) keep both.
- VERDICT (owner, 2026-10-15): (a) — "Remove both."

### S6 — Scope exclusions (VERDICTED)

- CONTEXT: plan §R lists recurrence, reminders, drag to move/resize,
  dark mode, free/busy, RSVP replies, Contacts linkage, paging.
- OPTIONS: (a) confirm §R as written. (b) pull one or more back in as
  new items (name them).
- VERDICT (owner, 2026-10-15): "all stay out of this loop, but queue
  them for the next one." §R is confirmed for this loop and is now the
  seed list of the NEXT loop (recorded in the plan of record's §R).

### S7 — Search matching (VERDICTED)

- CONTEXT: plan §5.
- OPTIONS: (a) fold in JS inside `GetEvents` like Contacts (the window
  is small; the PRAGMA goes). (b) keep SQL `LIKE`, escape wildcards,
  accept ASCII-only folding.
- VERDICT (owner, 2026-10-15): (a) — "Fold in JS like Contacts."
