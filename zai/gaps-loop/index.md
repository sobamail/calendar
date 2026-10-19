GAPS-LOOP-COMPLETE

# Gaps loop — INDEX

The loop that closes what the calendar lacks as the calendaring interface
of an email platform: a test harness, backend hygiene, a complete event
form, direct manipulation, search, user-defined calendars, multi-day
events, an iCalendar library with export/import, invitations out and in,
view and chrome fixes, locale, and the time-zone decision — thirteen
items, G1–G13, one per section of the plan of record
`zai/calendar-gaps.md` (its §R lists what was rejected). Durable facts:
`zai/calendar-facts.md`. Driver: `gaps-loop/loop.sh` — a fresh
`claude -p` per pass; THIS doc set is the only inter-pass memory.

## Reading order (STARTUP, nothing more)

1. `ground-rules.md` (next to this file) — the protocol, every pass.
   Its ARMING GATE comes before everything.
2. Load the `sobamail-app` skill: invoke it with the Skill tool (name
   `sobamail-app`). A fresh pass has NOT loaded it — project skills are
   listed, never auto-applied — and it is the platform reference every
   backend, wire and UI decision rests on. If the Skill tool is missing,
   read `.claude/skills/sobamail-app/SKILL.md` instead. Its
   `references/*.md` are read only when the item's "reads" line names
   them.
3. The ONE item section in `items.md` that the NEXT ITEM pointer below
   names — whatever it names now.
4. The subject docs that item's "reads" line names — nothing else.
5. The repo's `CLAUDE.md`.

## Status

NEXT ITEM: none — all thirteen items closed 2026-10-15; the loop is complete

Created 2026-10-14, ARMED 2026-10-15: the owner verdicted S1–S7 in
`items.md` (all (a) except S4, which picked (b) — a per-event `tz`
attr; S6 confirmed §R and queued it for the next loop) and confirmed the
six standing sign-offs in the ground rules. Closed: G1 (vitest harness,
41 tests; facts doc "Tests"), G2 (backend hygiene, 66 tests; facts doc
"Data model"), G3 (event form completeness, 84 tests; facts doc "UI"),
G4 (direct manipulation and dialogs, 97 tests; facts doc "UI"), G5
(search folded in js, 104 tests; facts doc "Data model"), G6 (user
calendars, 132 tests; facts doc "Data model"), G7 (multi-day events,
150 tests; facts doc "Data model"), G8 (iCalendar export/import, 169
tests; facts doc "UI"), G9 (invitations out, 177 tests; facts doc "UI"), G10
(invitations in, 189 tests; facts doc "Data model"), G11 (views and chrome, 196
tests; facts doc "UI"), G12 (locale, 203 tests; facts doc "UI"), G13 (time zone,
223 tests; facts doc "Data model"). Next: the plan's §R seeds the follow-up loop.

## Owner questions (parking area)

(none parked)

## Tokens (the driver greps this file — never reproduce the shapes early)

- Completion: when the LAST item closes AND gate-check, gate-test,
  gate-build and gate-pin have run fully green in that pass, the pass
  writes the completion token — the string GAPS-LOOP-COMPLETE alone on
  its own line — at the top of this file. The driver matches whole
  lines only, so the mid-sentence mentions in this section never fire.
- Halt: only when NO item is actionable (not armed, all blocked or all
  done), park the pending question(s) as standalone
  "OWNER QUESTION (…):" blockquote lines above, then add a blockquote
  line holding the halt token — the string LOOP-HALT alone on that
  line, optionally after "> " — commit, stop. The driver exits 2 on
  that exact shape.

## Pass log (newest first; `> -` prefixed lines, ≤3 sentences, cap ~10)

> - 2026-10-15 pass 13 (master): G13 in two FIX units — `tz` attr, module `parse_ics`
>   keeps wall clocks in their zone, `dates.ts` `convertZone` (6ebc908, pin updated); the
>   store converts tz ↔ browser, `write_ics` writes TZID/Z, popover "Scheduled in <tz>".
>   G13 CLOSED, 11 files / 223 tests, all four gates green; LOOP COMPLETE (token written).
> - 2026-10-15 pass 12 (master): G12 in one FIX unit — `lib/locale.ts` (`Intl` names,
>   the locale's hour cycle, `weekInfo` week start, `formatRangeToParts` ranges) behind
>   every label and `fmt`; the suite pinned to en-US/Monday by `test/setup.ts`. G12 CLOSED,
>   11 files / 203 tests, check/test/build green (module untouched, no pin); NEXT ITEM → G13.
> - 2026-10-15 pass 11 (master): G11 in one FIX unit — agenda lists and labels
>   `agendaSpan` (week start → last loaded day) and ends on an edge note; an "Event
>   limit" notice when a load fills `PAGE`; traffic lights and "Synced just now" removed.
>   G11 CLOSED, 10 files / 196 tests, check/test/build green (module untouched, no pin);
>   NEXT ITEM → G12.
> - 2026-10-15 pass 10 (master): G10 in three FIX units — ICS parser moved into the module
>   (UI adapts it); `read_invitations` writes METHOD:REQUEST mail as tentative events keyed
>   by `uid`, Mutator subscribes to plain mail (pins updated); UI dashes and labels
>   invitations, popover names the organizer. G10 CLOSED, 10 files / 189 tests, all four
>   gates green; NEXT ITEM → G11.
> - 2026-10-15 pass 9 (master): G9 in two FIX units — module `SendInvite` mails the UI's
>   ICS as `text/calendar; method=REQUEST` from the account, `GetAccount` gives the
>   ORGANIZER (00135f7, pin updated); popover "Send invitations", offered after saving
>   with guests. G9 CLOSED, 9 files / 177 tests, all four gates green; NEXT ITEM → G10.
> - 2026-10-15 pass 8 (master): G8 in two FIX units — `lib/ics.ts` writer/parser
>   (floating out; Z/IANA TZID in, Windows TZID kept; 4b90053); toolbar and popover
>   Export, toolbar Import via `ImportDialog.svelte`. G8 CLOSED, 8 files / 169 tests,
>   check/test/build green (module untouched, no pin); NEXT ITEM → G9.
> - 2026-10-15 pass 7 (master): G7 in three FIX units — `GetEvents` keeps events
>   overlapping the window (`start < to AND end >= from`; 4123507, pin updated);
>   `endDate` + Start/End date form + `pieceOn` day pieces (673bbea); month/all-day
>   chips with flat joins, agenda "(day N of M)", popover both ends. G7 CLOSED, 7
>   files / 150 tests, all four gates green; NEXT ITEM → G8.

> - 2026-10-15 pass 6 (master): G6 in two FIX units — `calendar`/`calendar_attr`
>   tables with Put/Get/DeleteCalendar, delete refused while events use it
>   (5cc04a5, pin updated); sidebar add/rename/recolor/delete dialog, unknown `cal`
>   gray and visible, visibility in `localStorage`. G6 CLOSED, 7 files / 132
>   tests, all four gates green; two UNVERIFIED added; NEXT ITEM → G7.
> - 2026-10-15 pass 5 (master): G5 in two FIX units — `GetEvents` folds
>   in js (Contacts' `fold()`, PRAGMA/LIKE gone, `%`/`_` literal, paging
>   over hits; dd5eede, pin updated); toolbar "N of M in view" / "no matches
>   in the shown months" / Clear search. G5 CLOSED, 7 files / 104 tests, all
>   four gates green; NEXT ITEM → G6.
> - 2026-10-15 pass 4 (master): G4 in three FIX units — dialogs take and
>   return focus and close on Escape (0c244d7, svelte-check 4 → 0 warnings);
>   Delete asks first (52fc180); click-to-create at the clicked half hour /
>   month day and a "+N more" button. G4 CLOSED, 7 files / 97 tests, check,
>   test and build green (module untouched, no pin); NEXT ITEM → G5.
