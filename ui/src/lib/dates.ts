/**
 * Date helpers for the calendar. All arithmetic works in the browser's local
 * time zone; a day is stored/keyed as a "YYYY-MM-DD" string (see ymd/parseYmd).
 * Never round-trip through Date.toISOString() — that shifts to UTC and can move
 * the day across a boundary. Names, labels and the week start follow the locale
 * (locale.ts).
 */

import {dayGroupDay, firstDay, longDay, monthYear, shortRange, weekdayName} from "./locale";

/** Index of `d` within its week: 0 = the locale's first day … 6. */
export function weekdayIndex(d: Date): number { return (d.getDay() - firstDay() + 7) % 7; }

/** Local midnight of the current day. */
export function today(): Date {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

export function addDays(d: Date, n: number): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/**
 * Same day-of-month `n` months away, clamped to the target month's length, so
 * Jan 31 + 1 is Feb 28/29 rather than overflowing into March.
 */
export function addMonths(d: Date, n: number): Date {
    const first = new Date(d.getFullYear(), d.getMonth() + n, 1);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    return new Date(first.getFullYear(), first.getMonth(), Math.min(d.getDate(), last));
}

/** The first day (per the locale) of the week containing `d`. */
export function startOfWeek(d: Date): Date { return addDays(d, -weekdayIndex(d)); }

export function sameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
            && a.getDate() === b.getDate();
}

/** "YYYY-MM-DD" for the local date. Lexical order equals chronological order. */
export function ymd(d: Date): string {
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
}

export function parseYmd(s: string): Date {
    const [ y, m, d ] = s.split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
}

/** Whole days from "YYYY-MM-DD" `a` to `b`; rounded, so a DST change doesn't skew it. */
export function daysBetween(a: string, b: string): number {
    return Math.round((parseYmd(b).getTime() - parseYmd(a).getTime()) / 86400000);
}

/** The 7 days of the week containing `anchor`, from the locale's first day. */
export function weekDays(anchor: Date): Date[] {
    const start = startOfWeek(anchor);
    return Array.from({length : 7}, (_, i) => addDays(start, i));
}

/** A 6×7 grid covering (and padding) the month of `anchor`, weeks from the locale's first day. */
export function monthMatrix(anchor: Date): Date[][] {
    const start = startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
    return Array.from(
            {length : 6},
            (_, w) => Array.from({length : 7}, (_, i) => addDays(start, w * 7 + i)));
}

/** "Wed" */
export function weekdayShort(d: Date): string { return weekdayName(d, "short"); }

/** The 7 weekday names of a column header ("Mon" … or "M" …), from the locale's first day. */
export function weekdayHeaders(width: "short"|"narrow"): string[] {
    return weekDays(new Date(2026, 0, 1)).map((d) => weekdayName(d, width));
}

/** "July 2026" */
export function monthLabel(d: Date): string { return monthYear(d); }

/** "Wednesday, July 8, 2026" */
export function longDate(d: Date): string { return longDay(d); }

/** "Wednesday, July 8" (no year — used for agenda / day group headers). */
export function dayGroupLabel(d: Date): string { return dayGroupDay(d); }

/** "Jul 6 – 12, 2026", collapsing shared month/year across the week. */
export function weekRangeLabel(anchor: Date): string {
    const days = weekDays(anchor);
    return shortRange(days[0], days[6]);
}

/**
 * The days the agenda lists: from the cursor's week start to the last day of the
 * loaded window (`loadWindow`'s exclusive `to` less a day), both "YYYY-MM-DD".
 */
export function agendaSpan(cursor: Date): { from: string; last: string } {
    return {
        from: ymd(startOfWeek(cursor)),
        last: ymd(addDays(parseYmd(loadWindow(cursor).to), -1)),
    };
}

/** "Oct 12 → Nov 29, 2026": the agenda's span. */
export function agendaRangeLabel(cursor: Date): string {
    const { from, last } = agendaSpan(cursor);
    return shortRange(parseYmd(from), parseYmd(last), " → ");
}

// ---- ISO datetime <-> view-model (date + fractional hour) ----------------
// Storage/wire format is a local-naive ISO datetime "YYYY-MM-DDTHH:MM"; the UI
// works in a date string + fractional hour, so these bridge the two.

/** "YYYY-MM-DD" date part of an ISO datetime. */
export function dateOf(iso: string): string { return iso.slice(0, 10); }

/** Fractional hour (9.5 = 09:30) from an ISO datetime's time part. */
export function hourOf(iso: string): number {
    const [ h, m ] = iso.slice(11).split(":").map(Number);
    return (h || 0) + (m || 0) / 60;
}

// ---- time zones ----------------------------------------------------------
// An event's start/end are the wall clock of its `tz` (an IANA name; "" is the
// browser's). The UI shows and edits them in the browser's zone, converting in
// and out at the store's boundary.

let zoneOverride: string | null = null;

/** Make `tz` the browser's zone for convertZone (tests); null goes back to the real one. */
export function setZone(tz: string | null) { zoneOverride = tz; }

/** The browser's IANA zone. */
export function localZone(): string {
    return zoneOverride ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}

// how far `tz`'s wall clock is ahead of UTC at the instant `ms`; throws on an unknown zone
function zoneOffset(tz: string, ms: number): number {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone : tz,
        hourCycle : "h23",
        year : "numeric",
        month : "numeric",
        day : "numeric",
        hour : "numeric",
        minute : "numeric",
    }).formatToParts(new Date(ms));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
    return wall - Math.floor(ms / 60000) * 60000;
}

/**
 * The naive ISO datetime `iso`, the wall clock of zone `from`, as the wall clock of zone
 * `to`; "" for either is the browser's zone. Unchanged when a zone is unknown.
 */
export function convertZone(iso: string, from: string, to: string): string {
    from ||= localZone();
    to ||= localZone();
    if (from === to)
        return iso;
    const [ y, mo, d ] = dateOf(iso).split("-").map(Number);
    const h = hourOf(iso);
    const wall = Date.UTC(y, mo - 1, d, Math.floor(h), Math.round((h % 1) * 60));
    try {
        const ms = wall - zoneOffset(from, wall - zoneOffset(from, wall));
        return new Date(ms + zoneOffset(to, ms)).toISOString().slice(0, 16);
    } catch {
        return iso;
    }
}

/** Build a local-naive ISO datetime from a "YYYY-MM-DD" and a fractional hour. */
export function isoAt(date: string, hour: number): string {
    const h = Math.floor(hour + 1e-9);
    const m = Math.round((hour - h) * 60);
    return `${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * The [from, to) date-string window to fetch for a cursor — a generous ±~1
 * month so the mini-month, month grid and a forward agenda are all covered
 * from a single windowed read. `to` is exclusive.
 */
export function loadWindow(cursor: Date): { from: string; to: string } {
    const from = startOfWeek(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
    const to = startOfWeek(new Date(cursor.getFullYear(), cursor.getMonth() + 2, 1));
    return { from: ymd(from), to: ymd(to) };
}
